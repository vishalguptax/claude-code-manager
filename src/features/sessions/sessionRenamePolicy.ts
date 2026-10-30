/**
 * Decides whether sidebar renames are handed to Claude Code
 * (`claudeManager.sessions.renameInClaudeCode`), and keeps the rename hook
 * in `~/.claude/settings.json` in step with that decision.
 *
 * Handing a rename over costs a SessionStart and a UserPromptSubmit entry in
 * the user's global Claude settings — a file Claude Code reads for every
 * session on the machine — so it is the user's call: asked once, at their
 * first rename, and changeable in Settings afterwards.
 *
 *   setting true       → install / converge the hook; sidebar-only names
 *                        are handed over
 *   setting false      → remove the hook; unapplied renames stay as
 *                        sidebar-only names
 *   setting untouched  → nothing installed; the first rename asks
 */
import * as vscode from "vscode";
import { SESSION_RENAME_TAP_FILE } from "../../core/config";
import {
  copyHookScript,
  ensureHooks,
  removeHooks,
  type HookSpec,
  type TapChange,
} from "./hookInstall";
import { movePendingToRenames, moveRenamesToPending } from "./renames";

const SECTION = "claudeManager.sessions";
const KEY = "renameInClaudeCode";
const SETTING = `${SECTION}.${KEY}`;

/** The rename hook runs on both events whose output may carry `sessionTitle`. */
const HOOKS: readonly HookSpec[] = [
  { event: "SessionStart", scriptFile: SESSION_RENAME_TAP_FILE },
  { event: "UserPromptSubmit", scriptFile: SESSION_RENAME_TAP_FILE },
];

/**
 * The user's explicit choice, or undefined when they have never made one.
 * The user value only — a `.vscode/settings.json` committed to a repository
 * must not be able to install a machine-wide hook by being opened (the
 * setting is also declared `"scope": "machine"`).
 */
function explicitChoice(): boolean | undefined {
  return vscode.workspace.getConfiguration(SECTION).inspect<boolean>(KEY)?.globalValue;
}

const ASK_RENAME = "Rename in Claude Code";
const ASK_SIDEBAR = "Sidebar Only";

/**
 * Whether this rename goes to Claude Code. Asks on the first rename and
 * records the answer as the setting; undefined when the user dismissed the
 * question, which cancels the rename.
 */
export async function chooseRenameTarget(): Promise<boolean | undefined> {
  const choice = explicitChoice();
  if (choice !== undefined) return choice;
  const answer = await vscode.window.showInformationMessage(
    "Rename sessions in Claude Code too?",
    {
      modal: true,
      detail:
        "Claude Code Manager can hand your renames to Claude Code, so the name shows in its " +
        "prompt box, /resume and terminal title, and other sessions can message the session " +
        "by it. A running session takes the name on its next prompt.\n\n" +
        "This adds a hook to ~/.claude/settings.json. You can change this later in Settings " +
        `(${SETTING}).`,
    },
    ASK_RENAME,
    ASK_SIDEBAR,
  );
  if (answer === undefined) return undefined;
  const inClaudeCode = answer === ASK_RENAME;
  await vscode.workspace
    .getConfiguration(SECTION)
    .update(KEY, inClaudeCode, vscode.ConfigurationTarget.Global);
  return inClaudeCode;
}

/** What started a sync — see sessionTapPolicy's trigger of the same name. */
type SyncTrigger = "activation" | "setting-change";

function reportFailure(change: TapChange, action: string, trigger: SyncTrigger): void {
  if (change.ok) return;
  if (trigger === "setting-change") {
    void vscode.window.showWarningMessage(`Couldn't ${action} the rename hook: ${change.error}.`);
  } else if (change.reason !== "mid-write") {
    console.warn(`[claude-manager] rename hook: couldn't ${action} the hook: ${change.error}`);
  }
}

/**
 * Bring settings.json and the stored names in line with the current
 * decision. Safe to call repeatedly: every step reports "nothing to do"
 * rather than rewriting. Names move only once the hook is in the state they
 * need, so a failed install never strands a name where nothing reads it.
 */
export function syncRenameHook(extensionDistDir: string, trigger: SyncTrigger): void {
  try {
    const choice = explicitChoice();
    if (choice === true) {
      const change =
        copyHookScript(extensionDistDir, "session-rename-tap.js", SESSION_RENAME_TAP_FILE) ??
        ensureHooks(HOOKS);
      reportFailure(change, "install", trigger);
      if (change.ok) moveRenamesToPending();
      return;
    }
    if (choice === false) {
      const change = removeHooks(HOOKS);
      reportFailure(change, "remove", trigger);
      movePendingToRenames();
    }
  } catch (err) {
    console.warn("[claude-manager] rename hook sync failed:", err);
  }
}

/** Re-run the sync whenever the setting changes, so the toggle acts at once. */
export function watchRenameSetting(extensionDistDir: string): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SETTING)) syncRenameHook(extensionDistDir, "setting-change");
  });
}
