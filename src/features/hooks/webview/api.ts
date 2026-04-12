/**
 * Typed wrapper around vscode.postMessage for all hooks webview-to-extension messages.
 * Centralizes all message passing so callers never construct raw objects.
 */

import type { VSCodeAPI } from "../../../webview/types";

let _vscode: VSCodeAPI;

/**
 * Initialize the hooks API module with the VS Code API instance.
 * Must be called once at startup before any other API function.
 */
export function initHooksApi(vscode: VSCodeAPI): void {
  _vscode = vscode;
}

/** Request the list of hooks from the extension host. */
export function sendGetHooks(): void {
  _vscode.postMessage({ type: "getHooks" });
}

/** Request to open a Claude settings file at the given scope. */
export function sendOpenHookSettingsFile(scope: "global" | "project" | "local"): void {
  _vscode.postMessage({ type: "openSettingsFile", scope });
}
