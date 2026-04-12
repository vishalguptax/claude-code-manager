/**
 * Persistent webview state using VS Code's setState/getState API.
 * Survives reloads and window restarts. Stored per-webview.
 */

import type { VSCodeAPI } from "./types";

let _vscode: VSCodeAPI | null = null;

/** Initialize with the VS Code API handle. */
export function initPersistence(vscode: VSCodeAPI): void {
  _vscode = vscode;
}

/** Get a namespaced value from persisted state. Returns undefined if unset. */
export function getPersisted<T>(key: string): T | undefined {
  if (!_vscode?.getState) return undefined;
  const all = _vscode.getState() as Record<string, unknown> | undefined;
  return all?.[key] as T | undefined;
}

/** Set a namespaced value into persisted state. Merges with existing keys. */
export function setPersisted<T>(key: string, value: T): void {
  if (!_vscode?.setState || !_vscode.getState) return;
  const all = (_vscode.getState() as Record<string, unknown> | undefined) ?? {};
  all[key] = value;
  _vscode.setState(all);
}
