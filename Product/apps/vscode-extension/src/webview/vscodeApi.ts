declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

/** Must only call acquireVsCodeApi once per webview (React Strict Mode remount-safe). */
let api: ReturnType<typeof acquireVsCodeApi> | undefined;

export function getVsCodeApi(): ReturnType<typeof acquireVsCodeApi> {
  if (api === undefined) {
    api = acquireVsCodeApi();
  }
  return api;
}
