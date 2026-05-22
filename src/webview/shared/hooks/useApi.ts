/**
 * VS Code postMessage bridge for Preact components. The host injects
 * `acquireVsCodeApi` once at startup; main.tsx calls `setVscodeApi` so
 * components can post messages without re-acquiring the (single-use) handle.
 */

interface VsCodeApi {
  postMessage: (m: unknown) => void;
}

let _vscode: VsCodeApi | null = null;

/**
 * Register the acquired VS Code API. Call once during app bootstrap.
 */
export function setVscodeApi(api: VsCodeApi | null): void {
  _vscode = api;
}

/**
 * Preact hook returning the host postMessage bridge.
 */
export function useApi(): { post: (msg: unknown) => void } {
  return {
    post(msg: unknown): void {
      _vscode?.postMessage(msg);
    },
  };
}
