/** Messages from webview → extension host */
export type WebviewToExtension = { type: 'chat'; text: string };

/** Messages from extension host → webview */
export type ExtensionToWebview =
  | { type: 'reply'; text: string }
  | { type: 'error'; text: string };

export function isWebviewMessage(value: unknown): value is WebviewToExtension {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const o = value as { type?: string; text?: string };
  return o.type === 'chat' && typeof o.text === 'string';
}
