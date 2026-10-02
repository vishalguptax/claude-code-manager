/**
 * Decides whether the SessionStart tap may exist, and keeps
 * `~/.claude/settings.json` in step with that decision.
 *
 * The tap is what lets a session row know which terminal is running it
 * ("View" instead of "Resume") when the session was started outside this
 * extension. Buying that costs a `hooks.SessionStart` entry in the
 * user's global Claude settings — a file that also holds their
 * permission rules and their own hooks, and one Claude Code reads for
 * every session on the machine, not just the ones in this window. A
 * write with that reach is the user's call, not an activation side
 * effect, which is how the statusline tap has always worked
 * (`selfHealStatusline`: no opt-in record, no action).
 *
 * Three states, resolved on every activation:
 *
 *   setting explicitly true   → install / converge
 *   setting explicitly false  → remove
 *   setting untouched         → whatever settings.json already says
 *
 * That last line is the migration. The hook shipped as an unconditional
 * activation write for many releases, so a machine that already has it
 * belongs to a user for whom this has always worked; treating the
 * installed hook as the consent record keeps it working and leaves the
 * setting free to mean "the user has since said otherwise".
 */
import * as vscode from "vscode";
import {
  ensureSessionStartHook,
  isSessionStartHookInstalled,
  removeSessionStartHook,
  type TapChange,
} from "./sessionTapInstall";

const SECTION = "claudeManager.sessions";
const KEY = "terminalLinking";
const SETTING = `${SECTION}.${KEY}`;

/**
 * The user's explicit choice, or undefined when they have never made
 * one.
 *
 * `inspect` rather than `get`, because `get` cannot tell a user who set
 * `false` from a user who set nothing — and those two mean opposite
 * things for a hook that may already be installed.
 *
 * The user value only. The hook is global to the machine, so a
 * `.vscode/settings.json` committed to a repository must not be able to
 * install it on a contributor's machine by being opened. The setting is
 * declared `"scope": "machine"` for the same reason; reading only
 * `globalValue` means the guarantee does not rest on that declaration
 * alone.
 */
function explicitChoice(): boolean | undefined {
  return vscode.workspace.getConfiguration(SECTION).inspect<boolean>(KEY)?.globalValue;
}

/**
 * What started a sync. Activation runs unasked in every window, so it
 * stays quiet; a setting the user just changed is a request, and a request
 * that did nothing has to say why.
 */
type SyncTrigger = "activation" | "setting-change";

/**
 * Tell the user, or the log, why the hook could not be brought in line.
 * At activation a rewrite in progress is expected and the next activation
 * converges, so it is not even logged; anything else is logged, never
 * toasted — no window should nag on every start about a file the user may
 * be repairing.
 */
function reportFailure(change: TapChange, action: string, trigger: SyncTrigger): void {
  if (change.ok) return;
  if (trigger === "setting-change") {
    void vscode.window.showWarningMessage(`Couldn't ${action} the terminal-linking hook: ${change.error}.`);
  } else if (change.reason !== "mid-write") {
    console.warn(`[claude-manager] session tap: couldn't ${action} the hook: ${change.error}`);
  }
}

/**
 * Bring settings.json in line with the current decision. Safe to call
 * repeatedly — both installer and remover are idempotent and report
 * "nothing to do" rather than rewriting.
 *
 * The untouched-and-absent case does nothing at all: no settings read
 * turns into a write, and a first-run machine is left exactly as found.
 */
export function syncSessionTap(extensionDistDir: string, trigger: SyncTrigger): void {
  try {
    const choice = explicitChoice();
    if (choice === true) {
      reportFailure(ensureSessionStartHook(extensionDistDir), "install", trigger);
      return;
    }
    if (choice === false) {
      reportFailure(removeSessionStartHook(), "remove", trigger);
      return;
    }
    // Untouched: converge only what is already there, never introduce it.
    if (isSessionStartHookInstalled()) {
      reportFailure(ensureSessionStartHook(extensionDistDir), "update", trigger);
    }
  } catch (err) {
    console.warn("[claude-manager] session tap sync failed:", err);
  }
}

/**
 * Re-run the sync whenever the setting changes, so toggling it in the
 * Settings UI installs or removes the hook there and then. Without this
 * the checkbox would only take effect on the next window reload, which
 * reads as a broken toggle.
 */
export function watchTerminalLinkingSetting(
  extensionDistDir: string,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SETTING)) syncSessionTap(extensionDistDir, "setting-change");
  });
}
