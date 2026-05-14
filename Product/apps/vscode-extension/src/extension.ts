import { applyPatch } from 'diff';
import * as vscode from 'vscode';
import { LOCALAI_PREVIEW_SCHEME, LocalaiDiffPreviewProvider } from './diffPreviewProvider';
import { ollamaChat } from './ollama';
import type { ExtensionToWebview } from './protocol';
import { isWebviewMessage } from './protocol';

const viewType = 'localAiChatView';

const SYSTEM_INSTRUCTION = [
  '你是運行於 VSCode 的專業 AI coding 助手。',
  '- 請使用繁體中文回答。',
  '- 若 Context Mode 為 selection，請優先分析訊息中「Code Context」內的選取內容。',
  '- 請勿臆測或假裝讀過未在本訊息中提供的檔案或程式碼。',
  '- 回答請實用、直接，避免空泛寒暄。',
].join('\n');

/** System prompt for /edit: model must emit unified diff only (preview; not applied). */
const SYSTEM_EDIT_DIFF = [
  '你是 VSCode 中的程式修改助手（diff 預覽原型；本階段不會寫入或套用任何變更）。',
  '使用者的訊息會包含「要修改的程式碼」（整檔或選取區）與「修改說明」。',
  '- 請只輸出 GNU unified diff（diff -u）格式，且僅針對訊息中的單一 Active File。',
  '- 不要包在 markdown 程式碼區塊內；不要輸出前言、結語或額外解釋。',
  '- 若無法產生合法 diff，請只輸出一行繁體中文原因。',
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
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly diffPreview: LocalaiDiffPreviewProvider,
  ) {}

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

      const cfg = vscode.workspace.getConfiguration('localAi');
      const baseUrl = String(cfg.get('ollamaUrl') ?? 'http://127.0.0.1:11434');
      const model = String(cfg.get('model') ?? 'qwen2.5-coder:7b');
      try {
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
          const text = await ollamaChat(baseUrl, model, userMessage, SYSTEM_EDIT_DIFF);
          post(webview, { type: 'reply', text });
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
  let patched: string | false;
  try {
    patched = applyPatch(source, diffText.trim());
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
 * /edit flow: instruct model to emit unified diff only; code base is selection or full file.
 */
function buildEditUserMessage(instruction: string, editor: vscode.TextEditor): string {
  const doc = editor.document;
  const filePath = doc.uri.fsPath;
  const languageId = doc.languageId;
  const selectedRaw = doc.getText(editor.selection);
  const hasSelection = selectedRaw.trim().length > 0;

  if (hasSelection) {
    return [
      'Command: /edit (diff preview — 不會寫入檔案)',
      '',
      'Edit Instruction:',
      instruction.length > 0 ? instruction : '(未提供額外說明，請依程式意圖提出最小合理修改)',
      '',
      'Context Mode: selection',
      '',
      'Active File:',
      filePath,
      '',
      'Language:',
      languageId,
      '',
      'Code to modify (selection only):',
      selectedRaw,
      '',
      '請只輸出 unified diff（GNU diff -u）。',
    ].join('\n');
  }

  const fullFileContent = doc.getText();
  return [
    'Command: /edit (diff preview — 不會寫入檔案)',
    '',
    'Edit Instruction:',
    instruction.length > 0 ? instruction : '(未提供額外說明，請依程式意圖提出最小合理修改)',
    '',
    'Context Mode: full-file',
    '',
    'Active File:',
    filePath,
    '',
    'Language:',
    languageId,
    '',
    'Code to modify (full file):',
    fullFileContent,
    '',
    '請只輸出 unified diff（GNU diff -u）。',
  ].join('\n');
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
