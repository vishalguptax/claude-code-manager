/**
 * Workspace utilities — requires VS Code API.
 */
import * as vscode from "vscode";

/**
 * Get the filesystem path of the workspace folder that should be considered
 * "current". Returns empty string if no folder is open.
 *
 * Resolution order:
 * 1. In a multi-root workspace, prefer the folder containing the active editor.
 *    This way the sessions list reflects the project the user is actively
 *    working in, not always the first folder in the multi-root list.
 * 2. Otherwise fall back to the first workspace folder.
 *
 * Note: callers should treat an empty string as "no workspace" and apply the
 * "all projects" filter rather than an empty-name filter that matches nothing.
 */
export function getWorkspace(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return "";

  if (folders.length > 1) {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
      const containing = vscode.workspace.getWorkspaceFolder(activeUri);
      if (containing) return containing.uri.fsPath;
    }
  }

  return folders[0].uri.fsPath;
}
