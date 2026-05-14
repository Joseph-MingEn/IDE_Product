import * as vscode from 'vscode';

export const LOCALAI_PREVIEW_SCHEME = 'localai-diff-preview';

/** In-memory right-hand side for `vscode.diff` (no disk write). */
export class LocalaiDiffPreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly store = new Map<string, string>();

  createPreviewUri(fsPath: string): vscode.Uri {
    const ext = lastExtension(fsPath);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const fileName = `localai-preview-${id}${ext}`;
    return vscode.Uri.from({
      scheme: LOCALAI_PREVIEW_SCHEME,
      path: `/${fileName}`,
    });
  }

  setContent(uri: vscode.Uri, text: string): void {
    const key = fileNameFromUri(uri);
    this.store.set(key, text);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const key = fileNameFromUri(uri);
    return this.store.get(key) ?? '';
  }
}

function fileNameFromUri(uri: vscode.Uri): string {
  const p = uri.path.replace(/\\/g, '/');
  const slash = p.lastIndexOf('/');
  return slash >= 0 ? p.slice(slash + 1) : p;
}

function lastExtension(fsPath: string): string {
  const base = fsPath.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '.txt';
}
