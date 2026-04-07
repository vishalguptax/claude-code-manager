/**
 * Typed wrapper around vscode.postMessage for all MCP webview-to-extension messages.
 * Centralizes all message passing so callers never construct raw objects.
 */

import type { VSCodeAPI } from "../../../webview/types";
import type { McpServerScope } from "../types";

let _vscode: VSCodeAPI;

/**
 * Initialize the MCP API module with the VS Code API instance.
 * Must be called once at startup before any other API function.
 */
export function initMcpApi(vscode: VSCodeAPI): void {
  _vscode = vscode;
}

/** Request the list of MCP servers from the extension host. */
export function sendGetMcpServers(): void {
  _vscode.postMessage({ type: "getMcpServers" });
}

/** Request the extension host to open the MCP config file for the given scope. */
export function sendOpenMcpConfig(scope: McpServerScope): void {
  _vscode.postMessage({ type: "openMcpConfig", scope });
}
