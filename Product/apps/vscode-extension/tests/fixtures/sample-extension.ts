import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('localAiChatView', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate(): void {}

class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const { webview } = webviewView;
    webview.onDidReceiveMessage(async (raw: unknown) => {
      if (raw && typeof raw === 'object' && 'type' in raw) {
        const msg = raw as { type: string };
        if (msg.type === 'chat') {
          return;
        }
        if (msg.type === 'acceptPreview') {
          return;
        }
      }
    });
  }
}
