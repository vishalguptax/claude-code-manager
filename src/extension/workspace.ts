/**
 * Workspace utilities — requires VS Code API.
 */
import * as vscode from "vscode";

/**
 * Get the filesystem path of the first open workspace folder, or empty string if none.
 */
export function getWorkspace(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
}
