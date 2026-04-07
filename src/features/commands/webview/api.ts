/**
 * Typed wrapper around vscode.postMessage for all commands webview-to-extension messages.
 * Centralizes all message passing so callers never construct raw objects.
 */

import type { VSCodeAPI } from "../../../webview/types";

let _vscode: VSCodeAPI;

/**
 * Initialize the commands API module with the VS Code API instance.
 * Must be called once at startup before any other API function.
 */
export function initCommandsApi(vscode: VSCodeAPI): void {
  _vscode = vscode;
}

/** Request the list of slash commands from the extension host. */
export function sendGetCommands(): void {
  _vscode.postMessage({ type: "getCommands" });
}

/** Request the extension host to open a command file in the editor. */
export function sendOpenCommandFile(path: string): void {
  _vscode.postMessage({ type: "openCommandFile", path });
}
