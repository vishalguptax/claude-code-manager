/**
 * Terminal creation helper — requires VS Code API.
 * Reads user settings for terminal location and position.
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
 */
function getTerminalIcon(): vscode.Uri | undefined {
  if (!extensionUri) return undefined;
  return vscode.Uri.joinPath(extensionUri, "media", "terminal-icon.svg");
}

/** Map user setting string to VS Code ViewColumn. */
const VIEW_COLUMN_MAP: Record<string, vscode.ViewColumn> = {
  beside: vscode.ViewColumn.Beside,
  active: vscode.ViewColumn.Active,
  one: vscode.ViewColumn.One,
  two: vscode.ViewColumn.Two,
  three: vscode.ViewColumn.Three,
};

/**
 * Read terminal location settings and build the TerminalOptions.location field.
 */
function getTerminalLocation(): vscode.TerminalEditorLocationOptions | undefined {
  const config = vscode.workspace.getConfiguration("claudeManager.terminal");
  const location = config.get<string>("location", "editor");

  if (location === "panel") return undefined; // undefined = default panel

  const position = config.get<string>("editorPosition", "beside");
  return { viewColumn: VIEW_COLUMN_MAP[position] ?? vscode.ViewColumn.Beside };
}

/**
 * Create a new VS Code terminal with the given name and optional working directory.
 * Respects user settings for terminal location and editor position.
 * The Claude Code icon is shown in its tab.
 */
export function createTerminal(name: string, cwd?: string): vscode.Terminal {
  const location = getTerminalLocation();
  return vscode.window.createTerminal({
    name,
    cwd: cwd || undefined,
    iconPath: getTerminalIcon(),
    ...(location ? { location } : {}),
  });
}
