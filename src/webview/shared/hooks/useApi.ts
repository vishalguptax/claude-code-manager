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
 * Preact hook returning the host postMessage bridge. Every post also
 * arms the shared busy indicator, which the host's `ack` clears — slow
 * handlers surface as a progress bar instead of a dead panel.
 */
export function useApi(): { post: (msg: unknown) => void } {
  return {
    post(msg: unknown): void {
      if (!_vscode) return;
      noteRequest();
      _vscode.postMessage(msg);
    },
  };
}
