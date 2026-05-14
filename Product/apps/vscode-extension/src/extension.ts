import * as vscode from 'vscode';
import { ollamaChat } from './ollama';
import type { ExtensionToWebview } from './protocol';
import { isWebviewMessage } from './protocol';

const viewType = 'localAiChatView';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate(): void {}

class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

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
      const cfg = vscode.workspace.getConfiguration('localAi');
      const baseUrl = String(cfg.get('ollamaUrl') ?? 'http://127.0.0.1:11434');
      const model = String(cfg.get('model') ?? 'llama3.2');
      try {
        const text = await ollamaChat(baseUrl, model, raw.text);
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
