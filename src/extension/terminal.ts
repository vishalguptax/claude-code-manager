/**
 * Terminal creation helper — requires VS Code API.
 * Reads user settings for terminal location and position.
 */
import * as vscode from "vscode";

/**
 * Validate a git ref name against git's own ref-format rules.
 * Returns the input if valid, null otherwise.
 *
 * Rules: no leading `-` or `/`; no `..`; no whitespace or any of `~^:?*[\`;
 * no trailing `.lock`; no ASCII control chars. Allowed body: A-Za-z0-9._/- .
 */
export function validateGitRef(name: string): string | null {
  if (typeof name !== "string" || name.length === 0) return null;
  if (/^[-/]/.test(name)) return null;
  if (/\.\./.test(name)) return null;
  if (/[\s~^:?*\[\\]/.test(name)) return null;
  if (/\.lock$/.test(name)) return null;
  if (/[\x00-\x1f\x7f]/.test(name)) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) return null;
  return name;
}

/** Extension root URI, captured at activation so we can resolve asset paths for terminal icons. */
let extensionUri: vscode.Uri | undefined;

interface TerminalRegistrySink {
  register(sessionId: string, terminal: vscode.Terminal): void;
}
let terminalRegistry: TerminalRegistrySink | undefined;

export function setTerminalRegistry(reg: TerminalRegistrySink | undefined): void {
  terminalRegistry = reg;
}

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

// Terminals we've already handed out, or that we otherwise must never reuse.
// Belt-and-suspenders against `state.isInteractedWith` not flipping for
// extension-driven sendText — without this, we could hijack an active session
// with an injected cd + resume command. WeakSet lets VS Code GC disposed
// terminals. Seeded + extended by initTerminalReuseGuard (see below).
const sentTo = new WeakSet<vscode.Terminal>();

interface ShellExecutionStartEvent {
  terminal: vscode.Terminal;
}
interface ShellExecutionApi {
  onDidStartTerminalShellExecution?: (
    listener: (e: ShellExecutionStartEvent) => void,
  ) => vscode.Disposable;
}

/**
 * `Terminal.shellIntegration` / `window.onDidChangeTerminalShellIntegration`
 * stabilized after our @types/vscode floor (pinned to the 1.90.0 engine
 * minimum), so neither is declared on the real types. Narrow surface,
 * feature-detected at the call site exactly like {@link ShellExecutionApi}
 * above — present and used on a host new enough to have it, silently
 * skipped (falls through to the timeout) on one that predates it.
 */
interface ShellIntegrationTerminal {
  shellIntegration?: unknown;
}
interface ShellIntegrationChangeEvent {
  terminal: vscode.Terminal;
}
interface ShellIntegrationApi {
  onDidChangeTerminalShellIntegration?: (
    listener: (e: ShellIntegrationChangeEvent) => void,
  ) => vscode.Disposable;
}

/**
 * Upper bound on how long {@link runInTerminal} waits for shell integration
 * before giving up and sending anyway. Generous for a slow shell profile
 * (oh-my-zsh and similar easily take over a second to source), but short
 * enough that a shell without integration support at all — the common
 * case this bounds — does not leave the user staring at an unresponsive
 * terminal for long.
 */
const SHELL_INTEGRATION_TIMEOUT_MS = 2500;

/**
 * Send `command` to a terminal, waiting for shell integration to finish
 * initializing first if the terminal was just created.
 *
 * VS Code's shell-integration hooks are injected by the shell itself while
 * it sources its startup file, which takes a moment after the terminal
 * opens. They are what drives the native busy-spinner on the terminal's
 * tab, and Claude Code's own `OSC 9;4` "agents running" progress ring rides
 * on the same plumbing. Calling `sendText` before that finishes means the
 * shell never attributes the command to a tracked execution — the command
 * still runs, but neither animation ever appears for the rest of that
 * terminal's life, because there is no second "command start" event coming
 * to retroactively pick it up. A terminal the user opens and types `claude`
 * into by hand does not hit this: by the time a human finishes reading the
 * prompt and typing, integration has long since activated.
 *
 * A terminal that already has `shellIntegration` set — reused, or created
 * far enough in advance — sends immediately, no wait. A terminal whose
 * shell never activates integration at all (the user disabled it, or it is
 * a shell VS Code does not support) falls through the timeout and sends
 * anyway: the command must not be silently lost waiting for an event that
 * will never fire.
 */
export function runInTerminal(term: vscode.Terminal, command: string): void {
  if ((term as ShellIntegrationTerminal).shellIntegration) {
    term.sendText(command);
    return;
  }

  const api = vscode.window as unknown as ShellIntegrationApi;
  const subscribe = api.onDidChangeTerminalShellIntegration;
  if (typeof subscribe !== "function") {
    // Host predates the event entirely — nothing to wait on.
    term.sendText(command);
    return;
  }

  let settled = false;
  let sub: vscode.Disposable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (): void => {
    if (settled) return;
    settled = true;
    sub?.dispose();
    if (timer !== undefined) clearTimeout(timer);
    term.sendText(command);
  };
  sub = subscribe((e) => {
    if (e.terminal === term) finish();
  });
  timer = setTimeout(finish, SHELL_INTEGRATION_TIMEOUT_MS);
}

/**
 * Harden the empty-terminal reuse heuristic against hijacking a terminal that
 * already hosts a running process — most importantly a live `claude` REPL.
 * Every command the extension sends (`reconnectMcp`, login/logout, run-command,
 * ask, new-chat, resume, hooks, imports) funnels through {@link createTerminal},
 * so this one guard protects them all.
 *
 * Two gaps make the `isInteractedWith` + `sentTo` check unsafe on its own:
 *  1. `sentTo` is in-memory, so a window reload clears it while VS Code
 *     restores the still-running `claude` terminals — they'd look "empty" again
 *     and the next action would inject `claude` + a slash command into the
 *     live session. This is the reported "started on an already running
 *     session" bug.
 *  2. `isInteractedWith` only flips on USER keystrokes, so a session driven by
 *     the extension's own sendText (or a script/task) reads as never-interacted.
 *
 * So: (a) at activation, mark every already-open terminal ineligible for reuse
 * — anything alive at startup is either a restored session or a pre-existing
 * user terminal, neither safe to inject into; and (b) mark any terminal
 * ineligible the instant it runs a foreground command (a shell execution is
 * the reliable "not empty" signal that survives even without keystrokes).
 *
 * Call once at activation. Returns a Disposable for the shell-execution
 * subscription; no-ops on VS Code builds without the shell-integration API.
 */
export function initTerminalReuseGuard(): vscode.Disposable {
  for (const t of vscode.window.terminals) sentTo.add(t);

  const api = vscode.window as unknown as ShellExecutionApi;
  const subscribe = api.onDidStartTerminalShellExecution;
  if (typeof subscribe !== "function") return { dispose: () => {} };
  return subscribe((e) => sentTo.add(e.terminal));
}

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
 * Before creating a new terminal, tries to reuse an empty one — still alive,
 * never typed in (`state.isInteractedWith === false`), and ALREADY CARRYING
 * THE NAME WE WANT. If a cwd is requested, we `cd` into it first so the
 * caller's subsequent sendText runs in the right directory. The double-quoted
 * path works across bash, zsh, cmd, and powershell.
 *
 * The name match is not cosmetic. VS Code has no API to rename a terminal
 * after creation, so reusing a differently-named one hands the user a tab
 * labelled something else entirely — which is how sessions ended up showing
 * "2.1.273 claude-code-manager": we adopted an idle terminal belonging to the
 * Claude Code extension and inherited the title it had written for itself.
 * Worse than the label, that also meant typing `claude --resume` into a
 * terminal another extension owned. Reuse now only ever recycles a tab of
 * ours that is already correctly labelled; anything else gets a fresh one.
 */
export function createTerminal(name: string, cwd?: string, sessionId?: string): vscode.Terminal {
  const empty = vscode.window.terminals.find(
    (t) =>
      t.exitStatus === undefined &&
      !t.state.isInteractedWith &&
      !sentTo.has(t) &&
      t.name === name,
  );
  if (empty) {
    // Git-bash on Windows interprets backslashes as escapes, so normalize to
    // forward slashes — safe on every shell the cwd flows into.
    if (cwd) empty.sendText(`cd "${cwd.replace(/\\/g, "/")}"`);
    sentTo.add(empty);
    if (sessionId) terminalRegistry?.register(sessionId, empty);
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
  if (sessionId) terminalRegistry?.register(sessionId, term);
  return term;
}
