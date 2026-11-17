/**
 * Terminal creation helper — requires VS Code API.
 * Reads user settings for terminal location and position.
 */
import * as vscode from "vscode";
import { CLAUDE_ENV } from "../core/config";

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

interface TerminalRegistrySink {
  register(sessionId: string, terminal: vscode.Terminal): void;
}
let terminalRegistry: TerminalRegistrySink | undefined;

export function setTerminalRegistry(reg: TerminalRegistrySink | undefined): void {
  terminalRegistry = reg;
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

interface ShellExecutionEvent {
  terminal: vscode.Terminal;
}
interface ShellExecutionApi {
  onDidStartTerminalShellExecution?: (
    listener: (e: ShellExecutionEvent) => void,
  ) => vscode.Disposable;
  onDidEndTerminalShellExecution?: (
    listener: (e: ShellExecutionEvent) => void,
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
 * How long past VS Code's own shell-integration timeout {@link runInTerminal}
 * holds out before sending without integration. Other extensions that type
 * into a new terminal fall back to `sendText` once that timeout passes —
 * the Python Environments extension sends its venv activation then — so we
 * must fall back strictly later, or `claude` starts first and the
 * activation is typed into it.
 */
const SHELL_INTEGRATION_FALLBACK_MARGIN_MS = 500;

/**
 * Wait used for a shell VS Code has no integration script for (cmd, sh,
 * nu, …). Nothing will ever arrive, and activators skip their own wait for
 * such shells, so this only needs to let a slow profile reach its prompt.
 */
const UNINTEGRATED_SHELL_WAIT_MS = 2500;

/** Shells VS Code injects shell integration into (git-bash runs bash). */
const INTEGRATED_SHELLS = new Set(["bash", "zsh", "fish", "pwsh", "powershell"]);

function supportsShellIntegration(shell: string): boolean {
  const name = (shell.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.exe$/, "");
  return INTEGRATED_SHELLS.has(name);
}

/**
 * How long {@link runInTerminal} waits for shell integration before sending
 * anyway: VS Code's `terminal.integrated.shellIntegration.timeout`, resolved
 * the way VS Code and the Python Environments extension resolve it (unset →
 * 5 s with integration on, 2 s off, 3 s off over remote; set → at least
 * 500 ms), plus a margin so we are the last to fall back.
 */
function shellIntegrationWaitMs(): number {
  if (!supportsShellIntegration(vscode.env.shell)) return UNINTEGRATED_SHELL_WAIT_MS;
  const cfg = vscode.workspace.getConfiguration("terminal.integrated");
  const configured = cfg.get<number>("shellIntegration.timeout");
  let base: number;
  if (typeof configured === "number" && configured >= 0) base = Math.max(configured, 500);
  else if (cfg.get<boolean>("shellIntegration.enabled", true)) base = 5000;
  else base = vscode.env.remoteName !== undefined ? 3000 : 2000;
  return base + SHELL_INTEGRATION_FALLBACK_MARGIN_MS;
}

/**
 * How long a freshly integrated terminal must stay free of shell executions
 * before {@link runInTerminal} sends. Auto-activators — the Python
 * Environments extension's venv activation is the reported case — wait for
 * the very same integration event we do and then run their own command
 * through `shellIntegration.executeCommand`. That execution reaches us as a
 * start event a few hundred milliseconds later at most; the window has to
 * cover that round trip or the two commands race, and whichever loses ends
 * up typed into the other (`source .venv/bin/activate` landing in Claude's
 * prompt).
 */
const SHELL_SETTLE_MS = 500;

/**
 * Upper bound on waiting for the terminal to go idle. An activation whose
 * end event never arrives must not swallow the command.
 */
const SHELL_IDLE_CAP_MS = 10_000;

/**
 * How long after `claude` is sent before a follow-up (a slash command or a
 * prompt) is typed into it: long enough, on most machines, for the REPL to
 * start and switch the TTY to raw input. Counted from the moment the command
 * actually goes out — the shell-integration and idle waits ahead of it can
 * run longer than this on their own, so a timer started by the caller would
 * type the follow-up into the shell (or into a venv activation) instead.
 */
const CLAUDE_INPUT_READY_MS = 1800;

/** Command-syntax family of a shell, from its executable path. */
export type ShellFamily = "powershell" | "cmd" | "posix";

export function shellFamily(shell: string): ShellFamily {
  // Either separator: `path.basename` splits only on the host's own.
  const name = (shell.split(/[\\/]/).pop() ?? "").toLowerCase();
  if (name.startsWith("pwsh") || name.startsWith("powershell")) return "powershell";
  if (name === "cmd.exe" || name === "cmd") return "cmd";
  return "posix";
}

/**
 * `first`, then `second` only if `first` succeeded, in the syntax of the
 * default shell — the one our terminals open with. Windows PowerShell 5.1
 * has no `&&` (only pwsh 7 does), so PowerShell gets the `$?` form, which
 * every version accepts. bash, zsh, fish 3+ and cmd all take `&&`.
 */
export function chainCommands(first: string, second: string): string {
  return shellFamily(vscode.env.shell) === "powershell"
    ? `${first}; if ($?) { ${second} }`
    : `${first} && ${second}`;
}

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
export function runInTerminal(term: vscode.Terminal, command: string, followUp?: string): void {
  const deliver = (): void => {
    term.sendText(command);
    if (followUp !== undefined) {
      setTimeout(() => term.sendText(followUp), CLAUDE_INPUT_READY_MS);
    }
  };
  if ((term as ShellIntegrationTerminal).shellIntegration) {
    deliver();
    return;
  }

  const api = vscode.window as unknown as ShellIntegrationApi;
  const subscribe = api.onDidChangeTerminalShellIntegration;
  if (typeof subscribe !== "function") {
    // Host predates the event entirely — nothing to wait on.
    deliver();
    return;
  }

  let settled = false;
  let sub: vscode.Disposable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (integrated: boolean): void => {
    if (settled) return;
    settled = true;
    sub?.dispose();
    if (timer !== undefined) clearTimeout(timer);
    // Without integration no execution events will ever arrive, so there
    // is no idleness to wait for.
    if (integrated) deliverWhenIdle(term, deliver);
    else deliver();
  };
  sub = subscribe((e) => {
    if (e.terminal === term) finish(true);
  });
  timer = setTimeout(() => finish(false), shellIntegrationWaitMs());
}

/**
 * Call `deliver` once `term` has gone {@link SHELL_SETTLE_MS} without a shell
 * execution in flight, so a command another extension runs at terminal open
 * (venv activation) finishes before ours starts instead of racing it. Each
 * execution that starts holds the send until it ends; the settle window then
 * restarts, since activators can chain more than one command.
 */
function deliverWhenIdle(term: vscode.Terminal, deliver: () => void): void {
  const api = vscode.window as unknown as ShellExecutionApi;
  const onStart = api.onDidStartTerminalShellExecution;
  const onEnd = api.onDidEndTerminalShellExecution;
  if (typeof onStart !== "function" || typeof onEnd !== "function") {
    deliver();
    return;
  }

  let sent = false;
  let running = 0;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let cap: ReturnType<typeof setTimeout> | undefined;
  const subs: vscode.Disposable[] = [];
  const send = (): void => {
    if (sent) return;
    sent = true;
    for (const s of subs) s.dispose();
    clearTimeout(quiet);
    clearTimeout(cap);
    deliver();
  };
  const armQuiet = (): void => {
    clearTimeout(quiet);
    quiet = setTimeout(send, SHELL_SETTLE_MS);
  };
  subs.push(
    onStart((e) => {
      if (e.terminal !== term) return;
      running++;
      clearTimeout(quiet);
    }),
    onEnd((e) => {
      if (e.terminal !== term) return;
      running = Math.max(0, running - 1);
      if (running === 0) armQuiet();
    }),
  );
  cap = setTimeout(send, SHELL_IDLE_CAP_MS);
  armQuiet();
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
 *
 * A name is a fixed title. VS Code (checked in 1.143) stores it as the
 * terminal's `staticTitle`, never listens for the shell's OSC title on that
 * terminal, and `TerminalLabelComputer.computeLabel` returns the static title
 * before consulting any template — `allowAgentCliTitle` included. So a name
 * stays on the tab for the terminal's whole life, whatever `claude` writes.
 *
 * Pass no name to let the tab follow the title `claude` writes, the way a
 * hand-opened `claude` does: VS Code then applies the `${sequence}` template
 * (forced for agent CLIs by `allowAgentCliTitle`, or the user's own
 * `tabs.title`). Callers do this whenever the CLI's title will be the
 * session's name — see sessionTabName. An unnamed terminal is never reused:
 * its label is whatever the shell last wrote, so nothing identifies it as
 * ours.
 */
/**
 * Whether `claude` run in `t` would see the CLAUDE_ENV we read from. A
 * terminal the user opened by hand never received it, so when the config
 * dir comes only from the official extension's setting, `claude` there
 * would write to ~/.claude while we read the custom dir. Always true for
 * the default layout, where CLAUDE_ENV is empty.
 */
function carriesClaudeEnv(t: vscode.Terminal): boolean {
  const env = (t.creationOptions as vscode.TerminalOptions | undefined)?.env ?? {};
  return Object.entries(CLAUDE_ENV).every(([key, value]) => env[key] === value);
}

export function createTerminal(name?: string, cwd?: string, sessionId?: string): vscode.Terminal {
  const empty = name === undefined ? undefined : vscode.window.terminals.find(
    (t) =>
      t.exitStatus === undefined &&
      !t.state.isInteractedWith &&
      !sentTo.has(t) &&
      t.name === name &&
      carriesClaudeEnv(t),
  );
  if (empty) {
    // Git-bash on Windows interprets backslashes as escapes, so normalize to
    // forward slashes — safe on every shell the cwd flows into. cmd's `cd`
    // stays on the current drive unless given /d.
    if (cwd) {
      const cd = shellFamily(vscode.env.shell) === "cmd" ? "cd /d" : "cd";
      empty.sendText(`${cd} "${cwd.replace(/\\/g, "/")}"`);
    }
    sentTo.add(empty);
    if (sessionId) terminalRegistry?.register(sessionId, empty);
    return empty;
  }

  const location = getTerminalLocation();
  // No `iconPath`: a terminal of ours should be an ordinary VS Code terminal.
  // Branding it cost more than it bought — a `Uri` icon is dropped entirely by
  // `TerminalEditorInput.getIcon()` (ThemeIcons only), and any custom icon
  // replaces the stock one users already read, including the activity it shows
  // while a command runs. The default icon behaves the same here as in a
  // terminal opened by hand, which is the point.
  // CLAUDE_ENV holds only the variables that move Claude Code's files
  // (empty for the default ~/.claude). Passing them makes the `claude` we
  // launch write where we read even when they came from the official
  // extension's setting, which the integrated terminal never sees.
  const term = vscode.window.createTerminal({
    ...(name !== undefined ? { name } : {}),
    cwd: cwd || undefined,
    ...(location ? { location } : {}),
    ...(Object.keys(CLAUDE_ENV).length > 0 ? { env: CLAUDE_ENV } : {}),
  });
  sentTo.add(term);
  if (sessionId) terminalRegistry?.register(sessionId, term);
  return term;
}
