/**
 * Typed wrapper around vscode.postMessage for all agents webview-to-extension messages.
 * Centralizes all message passing so callers never construct raw objects.
 */

import type { VSCodeAPI } from "../../../webview/types";

let _vscode: VSCodeAPI;

/**
 * Initialize the agents API module with the VS Code API instance.
 * Must be called once at startup before any other API function.
 */
export function initAgentsApi(vscode: VSCodeAPI): void {
  _vscode = vscode;
}

/** Request the list of agents from the extension host. */
export function sendGetAgents(): void {
  _vscode.postMessage({ type: "getAgents" });
}

/** Request the extension host to open an agent file in the editor. */
export function sendOpenAgentFile(path: string): void {
  _vscode.postMessage({ type: "openAgentFile", path });
}
