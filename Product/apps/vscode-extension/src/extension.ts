import { applyPatch } from 'diff';
import * as vscode from 'vscode';
import { LOCALAI_PREVIEW_SCHEME, LocalaiDiffPreviewProvider } from './diffPreviewProvider';
import { ollamaChat, ollamaChatMessagesStream } from './ollama';
import {
  buildChatUserMessage,
  buildOllamaChatMessages,
  getChatSystemPrompt,
} from './prompts/chatPrompt';
import { buildEditUserMessage, getEditSystemPrompt } from './prompts/editPrompt';
import type { ChatMessage, ExtensionToWebview } from './protocol';
import { isWebviewMessage } from './protocol';

const viewType = 'localAiChatView';
const CHAT_HISTORY_KEY = 'localAi.chatHistory';
const MAX_CHAT_HISTORY = 50;

type PendingEditPreview = {
  resource: vscode.Uri;
  previewUri: vscode.Uri;
  oldText: string;
  newText: string;
};

export function activate(context: vscode.ExtensionContext): void {
  const diffPreview = new LocalaiDiffPreviewProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(LOCALAI_PREVIEW_SCHEME, diffPreview),
  );
  const provider = new ChatViewProvider(context.extensionUri, diffPreview, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate(): void {}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private pendingEditPreview: PendingEditPreview | null = null;
  private chatHistory: ChatMessage[];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly diffPreview: LocalaiDiffPreviewProvider,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.chatHistory = loadChatHistory(this.context);
  }

  private persistChatHistory(): void {
    const trimmed = this.chatHistory.slice(-MAX_CHAT_HISTORY);
    this.chatHistory = trimmed;
    void this.context.workspaceState.update(CHAT_HISTORY_KEY, trimmed);
  }

  private appendChatMessage(msg: ChatMessage): void {
    if (msg.role === 'assistant' && msg.text.length === 0) {
      return;
    }
    this.chatHistory.push(msg);
    this.persistChatHistory();
  }

  private postHydrate(webview: vscode.Webview): void {
    post(webview, { type: 'hydrateMessages', messages: [...this.chatHistory] });
  }

  private handleClearHistory(webview: vscode.Webview): void {
    this.chatHistory = [];
    void this.context.workspaceState.update(CHAT_HISTORY_KEY, []);
    post(webview, { type: 'hydrateMessages', messages: [] });
  }

  private handleRejectPreview(webview: vscode.Webview): void {
    const previewUri = this.pendingEditPreview?.previewUri;
    this.pendingEditPreview = null;
    if (previewUri) {
      void closePreviewTab(previewUri);
    }
    post(webview, { type: 'previewCleared' });
  }

  private handleGetPreviewState(webview: vscode.Webview): void {
    const pending = this.pendingEditPreview;
    if (!pending) {
      return;
    }
    const rel = vscode.workspace.asRelativePath(pending.resource, false);
    post(webview, { type: 'previewPending', relativePath: rel });
  }

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
    const previewUri = pending.previewUri;
    this.pendingEditPreview = null;
    post(webview, { type: 'previewCleared' });
    void closePreviewTab(previewUri);
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
    this.postHydrate(webview);

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
      if (raw.type === 'rejectPreview') {
        this.handleRejectPreview(webview);
        return;
      }
      if (raw.type === 'getPreviewState') {
        this.handleGetPreviewState(webview);
        return;
      }
      if (raw.type === 'clearHistory') {
        this.handleClearHistory(webview);
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
          this.appendChatMessage({ role: 'user', text: rawText });
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            const errText = '「/edit」需要作用中編輯器：請先開啟要修改的檔案，再送出指令。';
            post(webview, { type: 'error', text: errText });
            this.appendChatMessage({ role: 'assistant', text: `Error: ${errText}` });
            return;
          }
          const instruction = rawText.replace(/^\s*\/edit\s*/, '').trim();
          const userMessage = buildEditUserMessage(instruction, editor);
          const oldText = editor.document.getText();
          const modelText = await ollamaChat(baseUrl, model, userMessage, getEditSystemPrompt());
          const newText = sanitizeModelFileOutput(modelText);
          const sanityError = validateEditModelOutput(oldText, modelText, newText);
          if (sanityError !== null) {
            post(webview, { type: 'error', text: sanityError });
            this.appendChatMessage({ role: 'assistant', text: `Error: ${sanityError}` });
            return;
          }
          const rightUri = this.diffPreview.createPreviewUri(editor.document.uri.fsPath);
          this.diffPreview.setContent(rightUri, newText);
          const rel = vscode.workspace.asRelativePath(editor.document.uri, false);
          const title = `Local AI 預覽 — ${rel}`;
          await vscode.commands.executeCommand(
            'vscode.diff',
            editor.document.uri,
            rightUri,
            title,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
          );
          void vscode.window.showInformationMessage(
            '右側為 AI 產生的完整檔案預覽（僅存在記憶體），不會自動寫入磁碟；左側為目前編輯器內容。請自行比對後再決定是否儲存。',
          );
          this.pendingEditPreview = {
            resource: editor.document.uri,
            previewUri: rightUri,
            oldText,
            newText,
          };
          post(webview, { type: 'previewPending', relativePath: rel });
          const statusText =
            newText === oldText
              ? '已開啟 diff 預覽：模型回傳與目前檔案內容相同（右側為對照預覽，未寫入磁碟）。'
              : '已開啟 diff 預覽：右側為完整檔案內容（僅預覽，未寫入磁碟）。';
          post(webview, { type: 'reply', text: statusText });
          this.appendChatMessage({ role: 'assistant', text: statusText });
          return;
        }

        const userMessage = await buildChatUserMessage(rawText);
        console.log('[Local AI] final user message (before Ollama):\n', userMessage);
        console.log('[Local AI] final user message has [Symbol Match]:', userMessage.includes('[Symbol Match]'));
        const ollamaMessages = buildOllamaChatMessages(
          this.chatHistory,
          userMessage,
          getChatSystemPrompt(),
        );
        console.log('[Local AI] prior chatHistory length:', this.chatHistory.length);
        console.log('[Local AI] prior chatHistory roles:', this.chatHistory.map((m) => m.role));
        console.log('[Local AI] ollama messages (roles):', ollamaMessages.map((m) => m.role));
        this.appendChatMessage({ role: 'user', text: rawText });
        post(webview, { type: 'replyStart' });
        let assistantText = '';
        try {
          await ollamaChatMessagesStream(baseUrl, model, ollamaMessages, (chunk) => {
            assistantText += chunk;
            post(webview, { type: 'replyDelta', text: chunk });
          });
          post(webview, { type: 'replyDone' });
          this.appendChatMessage({ role: 'assistant', text: assistantText });
        } catch (streamErr) {
          const errText = streamErr instanceof Error ? streamErr.message : String(streamErr);
          const assistantPersist =
            assistantText.length > 0
              ? `${assistantText}\n\nError: ${errText}`
              : `Error: ${errText}`;
          this.appendChatMessage({ role: 'assistant', text: assistantPersist });
          post(webview, { type: 'error', text: errText });
          post(webview, { type: 'replyDone' });
        }
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        this.appendChatMessage({ role: 'assistant', text: `Error: ${text}` });
        post(webview, { type: 'error', text });
        post(webview, { type: 'replyDone' });
      }
    });
  }
}

function post(webview: vscode.Webview, msg: ExtensionToWebview): void {
  void webview.postMessage(msg);
}

function loadChatHistory(context: vscode.ExtensionContext): ChatMessage[] {
  const raw = context.workspaceState.get<unknown>(CHAT_HISTORY_KEY);
  if (!Array.isArray(raw)) {
    return [];
  }
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const o = item as { role?: string; text?: string };
    if ((o.role === 'user' || o.role === 'assistant') && typeof o.text === 'string') {
      messages.push({ role: o.role, text: o.text });
    }
  }
  return messages.slice(-MAX_CHAT_HISTORY);
}

/**
 * Closes only a TextDiff tab whose modified side is the in-memory preview URI.
 * Never closes TabInputText / ordinary editor tabs. No-op if no match. Never throws.
 */
async function closePreviewTab(previewUri: vscode.Uri): Promise<void> {
  try {
    const target = previewUri.toString();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (!(input instanceof vscode.TabInputTextDiff)) {
          continue;
        }
        if (input.modified.scheme !== LOCALAI_PREVIEW_SCHEME) {
          continue;
        }
        if (input.modified.toString() !== target) {
          continue;
        }
        await vscode.window.tabGroups.close(tab);
        return;
      }
    }
  } catch {
    // ignore — must not block Accept / Reject
  }
}

/**
 * Basic /edit output checks after model returns (no auto-repair).
 * Returns an error message, or null if OK.
 */
function validateEditModelOutput(oldText: string, modelText: string, newText: string): string | null {
  if (modelText.trim().length === 0) {
    return '模型回傳為空，已拒絕預覽。';
  }
  const rawHead = modelText.trimStart();
  if (rawHead.startsWith('以下是') || rawHead.toLowerCase().startsWith('here is')) {
    return '模型回傳以說明文字開頭（以下是／Here is），已拒絕預覽。';
  }
  const cleanedHead = newText.trimStart();
  if (cleanedHead.startsWith('以下是')) {
    return '清理後內容以「以下是」開頭，疑似說明文字而非完整檔案，已拒絕預覽。';
  }
  if (cleanedHead.startsWith('說明')) {
    return '清理後內容以「說明」開頭，疑似說明文字而非完整檔案，已拒絕預覽。';
  }
  if (cleanedHead.toLowerCase().startsWith('explanation')) {
    return '清理後內容以 Explanation 開頭，疑似說明文字而非完整檔案，已拒絕預覽。';
  }
  if (cleanedHead.toLowerCase().startsWith('here is')) {
    return '清理後內容以 Here is 開頭，疑似說明文字而非完整檔案，已拒絕預覽。';
  }
  if (newText.slice(0, 300).includes('```')) {
    return '清理後內容前 300 字內含有 markdown fence（```），已拒絕預覽。';
  }
  if (oldText.length > 0 && newText.length < oldText.length * 0.3) {
    return '模型回傳過短（低於原檔長度 30%），已拒絕預覽。';
  }
  return null;
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
