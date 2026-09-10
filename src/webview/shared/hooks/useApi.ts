/**
 * VS Code postMessage bridge for Preact components. The host injects
 * `acquireVsCodeApi` once at startup; main.tsx calls `setVscodeApi` so
 * components can post messages without re-acquiring the (single-use) handle.
 */

import { noteRequest } from "../model/hostBusy";

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
 * The one bridge object every caller shares.
 *
 * Identity stability is load-bearing, not a micro-optimisation: callers
 * feed `post` into `useMemo`/`useEffect` dependency arrays. A fresh
 * object (or a fresh `post` closure) per render invalidates those deps
 * every render, so a mount effect that re-requests host data re-runs on
 * every render — and since the reply updates a signal, that render
 * loops forever. That is exactly what pinned the global busy bar on
 * after the Config tab had been opened once (tabs stay mounted, so the
 * loop outlived the tab switch). Reads `_vscode` lazily so the handle
 * can be registered after this module is first imported.
 */
const bridge = {
  post(msg: unknown): void {
    if (!_vscode) return;
    noteRequest();
    _vscode.postMessage(msg);
  },
};

/**
 * Preact hook returning the host postMessage bridge. Every post also
 * arms the shared busy indicator, which the host's `ack` clears — slow
 * handlers surface as a progress bar instead of a dead panel.
 *
 * The returned object is referentially stable for the life of the
 * webview; it is safe to list in a dependency array.
 */
export function useApi(): { post: (msg: unknown) => void } {
  return bridge;
}
