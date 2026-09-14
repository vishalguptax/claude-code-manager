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
 * Bring settings.json in line with the current decision. Safe to call
 * repeatedly — both installer and remover are idempotent and report
 * "nothing to do" rather than rewriting.
 *
 * The untouched-and-absent case does nothing at all: no settings read
 * turns into a write, and a first-run machine is left exactly as found.
 */
export function syncSessionTap(extensionDistDir: string): void {
  try {
    const choice = explicitChoice();
    if (choice === true) {
      ensureSessionStartHook(extensionDistDir);
      return;
    }
    if (choice === false) {
      removeSessionStartHook();
      return;
    }
    // Untouched: converge only what is already there, never introduce it.
    if (isSessionStartHookInstalled()) ensureSessionStartHook(extensionDistDir);
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
    if (e.affectsConfiguration(SETTING)) syncSessionTap(extensionDistDir);
  });
}
