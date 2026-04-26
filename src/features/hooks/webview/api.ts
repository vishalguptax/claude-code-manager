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

import type { Hook } from "../types";

/** Move the hook between active and parked blocks. */
export function sendToggleHookEnabled(hook: Hook): void {
  _vscode.postMessage({ type: "toggleHookEnabled", hook });
}

/** Permanently delete a hook. Host shows a confirm modal first. */
export function sendDeleteHook(hook: Hook): void {
  _vscode.postMessage({ type: "deleteHook", hook });
}

/** Apply a matcher / command edit to an existing hook. */
export function sendUpdateHook(
  original: Hook,
  next: { matcher: string; command: string },
): void {
  _vscode.postMessage({ type: "updateHook", original, next });
}

/** Open the host's native scope → event → matcher → command wizard. */
export function sendPromptAddHook(): void {
  _vscode.postMessage({ type: "promptAddHook" });
}
