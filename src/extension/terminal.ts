/**
 * Terminal creation helper — requires VS Code API.
 */
import * as vscode from "vscode";

/**
 * Create a new VS Code terminal with the given name and optional working directory.
 * The terminal opens beside the current editor.
 */
export function createTerminal(name: string, cwd?: string): vscode.Terminal {
  return vscode.window.createTerminal({
    name,
    cwd: cwd || undefined,
    location: { viewColumn: vscode.ViewColumn.Beside },
  });
}
