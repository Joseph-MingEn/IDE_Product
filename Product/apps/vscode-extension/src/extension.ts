import { applyPatch } from 'diff';
import * as vscode from 'vscode';
import { LOCALAI_PREVIEW_SCHEME, LocalaiDiffPreviewProvider } from './diffPreviewProvider';
import { ollamaChat } from './ollama';
import type { ExtensionToWebview } from './protocol';
import { isWebviewMessage } from './protocol';

const viewType = 'localAiChatView';

type PendingEditPreview = {
  resource: vscode.Uri;
  oldText: string;
  newText: string;
};

const SYSTEM_INSTRUCTION = [
  '你是運行於 VSCode 的專業 AI coding 助手。',
  '- 請使用繁體中文回答。',
  '- 若 Context Mode 為 selection，請優先分析訊息中「Code Context」內的選取內容。',
  '- 請勿臆測或假裝讀過未在本訊息中提供的檔案或程式碼。',
  '- 回答請實用、直接，避免空泛寒暄。',
].join('\n');

/** System prompt for /edit v0.2: model emits full modified file; extension opens diff preview. */
const SYSTEM_EDIT_FILE = [
  '你是 VSCode 中的程式修改助手（檔案預覽模式；本階段不會寫入或套用任何變更）。',
  '使用者訊息會提供 Active File 的完整內容與修改說明；你的輸出將與原檔在編輯器中並排對照。',
  '- 只輸出「完整修改後的檔案內容」純文字：與原檔相同語言／格式，包含所有未修改與已修改的行。',
  '- 不要輸出 unified diff、不要輸出 patch、不要輸出 diff --git。',
  '- 不要輸出 markdown code fence（例如 ``` 或 ```diff）。',
  '- 不要輸出說明文字、前言或結語。',
  '- 不要省略未修改的內容；不可只回傳片段或變更摘要。',
  '- 若無法依指示安全修改，請輸出與訊息中「目前完整檔案」相同的原始完整內容（一字不漏）。',
].join('\n');

export function activate(context: vscode.ExtensionContext): void {
  const diffPreview = new LocalaiDiffPreviewProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(LOCALAI_PREVIEW_SCHEME, diffPreview),
  );
  const provider = new ChatViewProvider(context.extensionUri, diffPreview);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate(): void {}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private pendingEditPreview: PendingEditPreview | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly diffPreview: LocalaiDiffPreviewProvider,
  ) {}

  private async handleAcceptPreview(webview: vscode.Webview): Promise<void> {
    const pending = this.pendingEditPreview;
    if (!pending) {
      post(webview, { type: 'error', text: '沒有可套用的預覽，請先執行 /edit。' });
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      post(webview, { type: 'error', text: '「Accept Preview」需要作用中編輯器，請開啟與預覽相同的檔案。' });
      return;
    }
    if (editor.document.uri.toString() !== pending.resource.toString()) {
      post(webview, {
        type: 'error',
        text: '作用中編輯器不是產生預覽時的檔案；請先切回該檔案再套用。',
      });
      return;
    }
    const current = editor.document.getText();
    if (current !== pending.oldText) {
      post(webview, {
        type: 'error',
        text: '檔案內容已與預覽前不同（可能已手動編輯）。未套用變更；請還原或重新執行 /edit。',
      });
      return;
    }
    const doc = editor.document;
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(current.length));
    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(doc.uri, fullRange, pending.newText);
    const applied = await vscode.workspace.applyEdit(wsEdit);
    if (!applied) {
      post(webview, { type: 'error', text: 'WorkspaceEdit 套用失敗，緩衝區未變更。' });
      return;
    }
    this.pendingEditPreview = null;
    post(webview, { type: 'previewCleared' });
    void vscode.window.showInformationMessage('已將預覽內容套用至編輯器緩衝區（尚未寫入磁碟）。');
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    const { webview } = webviewView;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out')],
    };
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'out', 'webview.js'));

    const nonce = String(Date.now());
    webview.html = getHtml(scriptUri, nonce, webview.cspSource);

    webview.onDidReceiveMessage(async (raw: unknown) => {
      if (!isWebviewMessage(raw)) {
        return;
      }
      if (raw.type === 'applyDiff') {
        try {
          await handleApplyDiffPreview(webview, raw.diffText, this.diffPreview);
        } catch (e) {
          const text = e instanceof Error ? e.message : String(e);
          post(webview, { type: 'error', text });
        }
        return;
      }
      if (raw.type === 'acceptPreview') {
        try {
          await this.handleAcceptPreview(webview);
        } catch (e) {
          const text = e instanceof Error ? e.message : String(e);
          post(webview, { type: 'error', text });
        }
        return;
      }

      const cfg = vscode.workspace.getConfiguration('localAi');
      const baseUrl = String(cfg.get('ollamaUrl') ?? 'http://127.0.0.1:11434');
      const model = String(cfg.get('model') ?? 'qwen2.5-coder:7b');
      try {
        if (raw.type !== 'chat') {
          return;
        }
        const rawText = raw.text;
        if (rawText.startsWith('/edit')) {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            post(webview, {
              type: 'error',
              text: '「/edit」需要作用中編輯器：請先開啟要修改的檔案，再送出指令。',
            });
            return;
          }
          const instruction = rawText.replace(/^\s*\/edit\s*/, '').trim();
          const userMessage = buildEditUserMessage(instruction, editor);
          const oldText = editor.document.getText();
          const modelText = await ollamaChat(baseUrl, model, userMessage, SYSTEM_EDIT_FILE);
          const newText = sanitizeModelFileOutput(modelText);
          const rightUri = this.diffPreview.createPreviewUri(editor.document.uri.fsPath);
          this.diffPreview.setContent(rightUri, newText);
          const rel = vscode.workspace.asRelativePath(editor.document.uri, false);
          const title = `Local AI 預覽 — ${rel}`;
          await vscode.commands.executeCommand('vscode.diff', editor.document.uri, rightUri, title);
          void vscode.window.showInformationMessage(
            '右側為 AI 產生的完整檔案預覽（僅存在記憶體），不會自動寫入磁碟；左側為目前編輯器內容。請自行比對後再決定是否儲存。',
          );
          this.pendingEditPreview = {
            resource: editor.document.uri,
            oldText,
            newText,
          };
          post(webview, { type: 'previewPending', relativePath: rel });
          post(webview, {
            type: 'reply',
            text:
              newText === oldText
                ? '已開啟 diff 預覽：模型回傳與目前檔案內容相同（右側為對照預覽，未寫入磁碟）。'
                : '已開啟 diff 預覽：右側為完整檔案內容（僅預覽，未寫入磁碟）。',
          });
          return;
        }

        const userMessage = buildChatUserMessage(rawText);
        const text = await ollamaChat(baseUrl, model, userMessage, SYSTEM_INSTRUCTION);
        post(webview, { type: 'reply', text });
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        post(webview, { type: 'error', text });
      }
    });
  }
}

function post(webview: vscode.Webview, msg: ExtensionToWebview): void {
  void webview.postMessage(msg);
}

/**
 * LLM full-file output: normalize newlines, strip outer ``` fences only.
 * Does not trim leading whitespace or file body; collapses 2+ trailing newlines to one.
 */
function sanitizeModelFileOutput(text: string): string {
  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = s.split('\n');
  const unwrapped = stripMarkdownFenceEdges(lines);
  s = unwrapped.join('\n');
  s = s.replace(/\n{2,}\z/, '\n');
  return s;
}

/** Minimal LLM diff cleanup: fences, newlines, preamble — does not repair hunks. */
function sanitizeUnifiedDiff(text: string): string {
  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = s.split('\n');
  const unwrapped = stripMarkdownFenceEdges(lines);
  s = unwrapped.join('\n');
  s = s.trim();
  s = stripDiffLeadingPreamble(s);
  return s.trim();
}

function isMarkdownFenceLine(line: string): boolean {
  return /^[\t ]*```[\w-]*[\t ]*$/.test(line);
}

/** Removes only leading/trailing ``` / ```lang lines so in-diff ``` lines stay intact. */
function stripMarkdownFenceEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && isMarkdownFenceLine(lines[start])) {
    start++;
  }
  while (end > start && isMarkdownFenceLine(lines[end - 1])) {
    end--;
  }
  return lines.slice(start, end);
}

/** Keeps text from the first line that starts a git or unified diff header. */
function stripDiffLeadingPreamble(s: string): string {
  const lines = s.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t.startsWith('diff --git') || t.startsWith('---')) {
      return lines.slice(i).join('\n');
    }
  }
  return s;
}

/**
 * Rejects obvious garbage inside @@ hunks before applyPatch (no repair).
 * Returns an error message, or null if OK.
 */
function validateUnifiedDiffForApplyPatch(diff: string): string | null {
  const lines = diff.split('\n');
  let inHunk = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    if (/^@@/.test(line)) {
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      continue;
    }
    if (line === '') {
      continue;
    }
    const ch = line[0];
    if (ch === ' ' || ch === '\t' || ch === '+' || ch === '-' || ch === '\\') {
      continue;
    }
    return `diff 格式不合法：第 ${lineNumber} 行位於 hunk 內，但沒有以空白、+、- 或 \\ 開頭。模型可能輸出了不完整 unified diff，請重新生成。`;
  }
  return null;
}

/**
 * Opens built-in diff: left = active document (unsaved buffer), right = in-memory patched preview.
 * Does not write disk; user must explicitly save or copy changes.
 */
async function handleApplyDiffPreview(
  webview: vscode.Webview,
  diffText: string,
  preview: LocalaiDiffPreviewProvider,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    post(webview, {
      type: 'error',
      text: '「套用預覽」需要作用中編輯器：請先開啟要比對的檔案。',
    });
    return;
  }
  const source = editor.document.getText();
  const cleaned = sanitizeUnifiedDiff(diffText);
  const diffValidationError = validateUnifiedDiffForApplyPatch(cleaned);
  if (diffValidationError !== null) {
    post(webview, { type: 'error', text: diffValidationError });
    return;
  }
  let patched: string | false;
  try {
    patched = applyPatch(source, cleaned);
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    post(webview, { type: 'error', text: `解析或套用 diff 失敗：${text}` });
    return;
  }
  if (patched === false) {
    post(webview, {
      type: 'error',
      text:
        '無法將此 unified diff 套用到目前檔案內容；可能與檔案版本不符或 diff 格式不完整。請重新產生 diff，或確認未手動變更過檔案。',
    });
    return;
  }
  const rightUri = preview.createPreviewUri(editor.document.uri.fsPath);
  preview.setContent(rightUri, patched);
  const rel = vscode.workspace.asRelativePath(editor.document.uri, false);
  const title = `Local AI 預覽 — ${rel}`;
  await vscode.commands.executeCommand('vscode.diff', editor.document.uri, rightUri, title);
  void vscode.window.showInformationMessage(
    '已開啟 diff 預覽：左側為目前編輯器緩衝區；右側為套用 diff 後的記憶體預覽。不會自動寫入磁碟；請自行比對後再於左側儲存或手動套用變更。',
  );
}

/**
 * /edit v0.2: model outputs full modified file; optional selection is edit focus only.
 */
function buildEditUserMessage(instruction: string, editor: vscode.TextEditor): string {
  const doc = editor.document;
  const filePath = doc.uri.fsPath;
  const languageId = doc.languageId;
  const fullFileContent = doc.getText();
  const selectedRaw = doc.getText(editor.selection);
  const hasSelection = selectedRaw.trim().length > 0;
  const sel = editor.selection;
  const startLine0 = Math.min(sel.start.line, sel.end.line);
  const endLine0 = Math.max(sel.start.line, sel.end.line);
  const selectionStart = startLine0 + 1;
  const selectionEnd = endLine0 + 1;

  const contextMode = hasSelection ? 'selection' : 'full-file';

  const parts: string[] = [
    'Command: /edit (full-file preview — 不會寫入磁碟)',
    '',
    'Edit Instruction:',
    instruction.length > 0 ? instruction : '(未提供額外說明，請依程式意圖提出最小合理修改)',
    '',
    `Context Mode: ${contextMode}`,
    '',
    'Active File:',
    filePath,
    '',
    'Language:',
    languageId,
    '',
    '重要：你的輸出必須是「完整修改後的檔案內容」純文字（與下方整檔同一結構），不是 unified diff、不是 patch、不是摘要。',
    '無論是否有 selection，都必須輸出整份檔案；未改動的段落需原樣保留。',
    'Selection（若有）僅標示修改焦點，輸出仍須為整檔。',
    '',
  ];

  if (hasSelection) {
    parts.push(
      'Edit focus (selection — 請優先在此範圍內改動，但回覆仍須包含整份檔案):',
      '',
      `selectionStart (line, 1-based): ${selectionStart}`,
      `selectionEnd (line, 1-based): ${selectionEnd}`,
      '',
      'Selected text:',
      selectedRaw,
      '',
    );
  }

  parts.push(
    'Current full file (請據此產出修改後的完整檔案內容):',
    fullFileContent,
    '',
    '請只輸出完整修改後的檔案內容（純文字）。',
  );

  return parts.join('\n');
}

/**
 * Builds the user-role message: context mode + question + file fields + code context
 * (selection OR full file, never both as primary code body).
 */
function buildChatUserMessage(userQuestion: string): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return ['Context Mode: no-editor', '', 'User Question:', userQuestion].join('\n');
  }

  const doc = editor.document;
  const filePath = doc.uri.fsPath;
  const languageId = doc.languageId;
  const selectedRaw = doc.getText(editor.selection);
  const hasSelection = selectedRaw.trim().length > 0;

  if (hasSelection) {
    return [
      'Context Mode: selection',
      '',
      'User Question:',
      userQuestion,
      '',
      'Active File:',
      filePath,
      '',
      'Language:',
      languageId,
      '',
      'Code Context (selection — 請優先分析此段):',
      selectedRaw,
    ].join('\n');
  }

  const fullFileContent = doc.getText();
  return [
    'Context Mode: full-file',
    '',
    'User Question:',
    userQuestion,
    '',
    'Active File:',
    filePath,
    '',
    'Language:',
    languageId,
    '',
    'Code Context (full file):',
    fullFileContent,
  ].join('\n');
}

function getHtml(scriptUri: vscode.Uri, nonce: string, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chat</title>
  <style>
    html, body { height: 100%; margin: 0; padding: 0; box-sizing: border-box; }
    #root { height: 100%; min-height: 0; display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
