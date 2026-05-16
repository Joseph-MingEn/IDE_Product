/** Persisted / hydrated chat entry (max 50 in workspaceState). */
export type ChatMessage = { role: 'user' | 'assistant'; text: string };

/** Messages from webview → extension host */
export type WebviewToExtension =
  | { type: 'chat'; text: string }
  | { type: 'applyDiff'; diffText: string }
  | { type: 'acceptPreview' }
  | { type: 'rejectPreview' }
  | { type: 'getPreviewState' }
  | { type: 'clearHistory' };

/** Messages from extension host → webview */
export type ExtensionToWebview =
  | { type: 'reply'; text: string }
  | { type: 'replyStart' }
  | { type: 'replyDelta'; text: string }
  | { type: 'replyDone' }
  | { type: 'error'; text: string }
  | { type: 'previewPending'; relativePath?: string }
  | { type: 'previewCleared' }
  | { type: 'hydrateMessages'; messages: ChatMessage[] };

export function isWebviewMessage(value: unknown): value is WebviewToExtension {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const o = value as { type?: string; text?: string; diffText?: string };
  if (o.type === 'chat' && typeof o.text === 'string') {
    return true;
  }
  if (o.type === 'applyDiff' && typeof o.diffText === 'string') {
    return true;
  }
  if (o.type === 'acceptPreview') {
    return true;
  }
  if (o.type === 'rejectPreview') {
    return true;
  }
  if (o.type === 'getPreviewState') {
    return true;
  }
  if (o.type === 'clearHistory') {
    return true;
  }
  return false;
}
