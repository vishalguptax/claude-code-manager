/**
 * Terminal creation helper — requires VS Code API.
 * Reads user settings for terminal location and position.
 */
import * as vscode from "vscode";

/** Extension root URI, captured at activation so we can resolve asset paths for terminal icons. */
let extensionUri: vscode.Uri | undefined;

/**
 * Register the extension's root URI so terminal icons can be resolved from bundled assets.
 * Called once during extension activation. Passing `undefined` clears it (used by tests).
 */
export function setExtensionUri(uri: vscode.Uri | undefined): void {
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

// Terminals we've already handed out. Belt-and-suspenders against
// `state.isInteractedWith` not flipping for extension-driven sendText —
// without this, we could hijack an active session with an injected cd +
// resume command. WeakSet lets VS Code GC disposed terminals.
const sentTo = new WeakSet<vscode.Terminal>();

/**
 * Find an editor ViewColumn that already hosts a terminal tab, if any.
 *
 * Prefers a column holding one of our own terminals (keeps our tabs together),
 * but falls back to any column with any terminal — so if the user already has
 * a terminal open in an editor group, new ones stack there as tabs instead of
 * splitting yet another panel. This is what fixes the "new panel instead of
 * new tab" complaint.
 *
 * Identity match uses the sentTo set rather than a name prefix, so terminal
 * names can be short (no "Claude: " branding required for grouping).
 */
function findExistingTerminalColumn(): vscode.ViewColumn | undefined {
  const ourNames = new Set<string>();
  for (const t of vscode.window.terminals) {
    if (sentTo.has(t)) ourNames.add(t.name);
  }
  let fallback: vscode.ViewColumn | undefined;
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (!(tab.input instanceof vscode.TabInputTerminal)) continue;
      if (ourNames.has(tab.label)) return group.viewColumn; // preferred
      if (fallback === undefined) fallback = group.viewColumn;
    }
  }
  return fallback;
}

/**
 * Read terminal location settings and build the TerminalOptions.location field.
 * If any terminal already exists in an editor column, target that column so
 * the new terminal stacks as a tab in the same group.
 */
function getTerminalLocation(): vscode.TerminalEditorLocationOptions | undefined {
  const config = vscode.workspace.getConfiguration("claudeManager.terminal");
  const location = config.get<string>("location", "editor");

  if (location === "panel") return undefined; // undefined = default panel

  const existingCol = findExistingTerminalColumn();
  if (existingCol !== undefined) {
    return { viewColumn: existingCol };
  }

  const position = config.get<string>("editorPosition", "beside");
  return { viewColumn: VIEW_COLUMN_MAP[position] ?? vscode.ViewColumn.Beside };
}

/**
 * Create a new VS Code terminal with the given name and optional working directory.
 * Respects user settings for terminal location and editor position.
 * The Claude Code icon is shown in its tab.
 *
 * Before creating a new terminal, tries to reuse any empty one — a terminal
 * that's still alive and that the user has literally never typed in
 * (`state.isInteractedWith === false`). This covers both Claude's own empty
 * tabs and user-opened scratch terminals. If a cwd is requested, we `cd` into
 * it first so the caller's subsequent sendText runs in the right directory.
 * The double-quoted path works across bash, zsh, cmd, and powershell.
 */
export function createTerminal(name: string, cwd?: string): vscode.Terminal {
  const empty = vscode.window.terminals.find(
    (t) =>
      t.exitStatus === undefined && !t.state.isInteractedWith && !sentTo.has(t),
  );
  if (empty) {
    // Git-bash on Windows interprets backslashes as escapes, so normalize to
    // forward slashes — safe on every shell the cwd flows into.
    if (cwd) empty.sendText(`cd "${cwd.replace(/\\/g, "/")}"`);
    sentTo.add(empty);
    return empty;
  }

  const location = getTerminalLocation();
  const term = vscode.window.createTerminal({
    name,
    cwd: cwd || undefined,
    iconPath: getTerminalIcon(),
    ...(location ? { location } : {}),
  });
  sentTo.add(term);
  return term;
}
