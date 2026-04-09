/**
 * Terminal creation helper — requires VS Code API.
 */
import * as vscode from "vscode";

/** Extension root URI, captured at activation so we can resolve asset paths for terminal icons. */
let extensionUri: vscode.Uri | undefined;

/**
 * Register the extension's root URI so terminal icons can be resolved from bundled assets.
 * Called once during extension activation.
 */
export function setExtensionUri(uri: vscode.Uri): void {
  extensionUri = uri;
}

/**
 * Resolve the Claude Code icon URI for use as a terminal tab icon.
 * Uses a dedicated monochrome SVG that renders with currentColor so VS Code
 * themes it correctly in both light and dark modes. Returns undefined if the
 * extension URI has not been set yet.
 */
function getTerminalIcon(): vscode.Uri | undefined {
  if (!extensionUri) return undefined;
  return vscode.Uri.joinPath(extensionUri, "media", "terminal-icon.svg");
}

/**
 * Create a new VS Code terminal with the given name and optional working directory.
 *
 * Opens in the editor area (beside the current editor) so multiple Claude
 * sessions can sit side-by-side as editor tabs without stealing the panel.
 * The user can still move it freely afterwards:
 *   - Drag the tab into another editor group
 *   - Right-click the tab → "Move Terminal to Panel"
 *   - Use the split button to split the editor group
 *
 * The Claude Code icon is shown in its tab.
 */
export function createTerminal(name: string, cwd?: string): vscode.Terminal {
  return vscode.window.createTerminal({
    name,
    cwd: cwd || undefined,
    iconPath: getTerminalIcon(),
    location: { viewColumn: vscode.ViewColumn.Beside },
  });
}
