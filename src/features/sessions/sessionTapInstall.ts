/**
 * Install the SessionStart hook tap into the user's global Claude
 * settings. Copies the bundled `dist/session-start-tap.js` to a stable
 * path under `~/.claude/.claude-manager/` (survives extension updates)
 * and ensures `hooks.SessionStart` contains an entry that runs it.
 *
 * Nothing here decides WHETHER the hook may exist — that is
 * `sessionTapPolicy`, which gates every call on the user's consent.
 * The settings mechanics are shared with every hook of ours — see
 * hookInstall.
 */
import { SESSION_TAP_FILE } from "../../core/config";
import {
  copyHookScript,
  ensureHooks,
  hookCommand,
  isHookInstalled,
  removeHooks,
  type HookSpec,
  type TapChange,
} from "./hookInstall";

export type { TapChange } from "./hookInstall";

const TAP: HookSpec = { event: "SessionStart", scriptFile: SESSION_TAP_FILE };

/** The shell command Claude CLI runs for the SessionStart hook. */
export function sessionTapCommand(): string {
  return hookCommand(SESSION_TAP_FILE);
}

/**
 * Ensure `hooks.SessionStart` contains exactly one entry pointing at
 * our tap, preserving every other user-defined SessionStart hook
 * unchanged.
 */
export function ensureSessionStartHook(extensionDistDir: string): TapChange {
  return (
    copyHookScript(extensionDistDir, "session-start-tap.js", SESSION_TAP_FILE) ??
    ensureHooks([TAP])
  );
}

/**
 * Whether settings.json already references our tap.
 *
 * This is the consent record. Claude Manager shipped the hook as an
 * unconditional activation write before `claudeManager.sessions.terminalLinking`
 * existed, so an installed hook is how an existing user's prior state is
 * told apart from a fresh machine that has never been written to.
 */
export function isSessionStartHookInstalled(): boolean {
  return isHookInstalled(TAP);
}

/**
 * Remove the tap hook from settings.json (leaves the on-disk script in
 * place — harmless once unreferenced).
 */
export function removeSessionStartHook(): TapChange {
  return removeHooks([TAP]);
}
