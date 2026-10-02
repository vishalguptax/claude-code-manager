/**
 * Install the SessionStart hook tap into the user's global Claude
 * settings. Copies the bundled `dist/session-start-tap.js` to a stable
 * path under `~/.claude/.claude-manager/` (survives extension updates)
 * and ensures `hooks.SessionStart` contains an entry that runs it.
 *
 * Idempotent: re-running refreshes the copied script but leaves the
 * settings entry alone while it still works (see isTapHealthy).
 *
 * Nothing here decides WHETHER the hook may exist — that is
 * `sessionTapPolicy`, which gates every call on the user's consent.
 * These functions only carry a decision out.
 *
 * Global scope only — SessionStart fires for every session anywhere on
 * the box, so per-project installs would multi-fire from overlapping
 * project / local settings. Global is the one scope Claude CLI reads
 * unconditionally.
 */
import * as fs from "fs";
import * as path from "path";
import {
  CLAUDE_MANAGER_DIR,
  SESSION_TAP_FILE,
  SETTINGS_FILE,
} from "../../core/config";
import {
  describeReadRefusal,
  readJsonObjectForWrite,
  writeFileAtomic,
  type ReadRefusalReason,
} from "../../core/atomicWrite";
import { commandNodeUsable, resolveNodePath } from "../../core/nodePath";

interface HookCommandEntry {
  type: "command";
  command: string;
}

interface SessionStartEntry {
  matcher?: string;
  hooks?: HookCommandEntry[];
}

interface SettingsShape {
  hooks?: Record<string, SessionStartEntry[]>;
  [k: string]: unknown;
}

/**
 * What an install or removal did. `changed` is false when settings.json
 * already said the right thing. A failure carries its reason, so the
 * caller can stay quiet about a rewrite in progress at activation yet tell
 * a user who just flipped the setting why nothing happened.
 */
export type TapChange =
  | { ok: true; changed: boolean }
  | { ok: false; reason: ReadRefusalReason | "copy-failed" | "write-failed"; error: string };

type TapFailure = Extract<TapChange, { ok: false }>;

const UNCHANGED: TapChange = { ok: true, changed: false };

/** The shell command Claude CLI runs for the SessionStart hook. */
export function sessionTapCommand(): string {
  return `"${resolveNodePath()}" "${SESSION_TAP_FILE}"`;
}

/**
 * Recognise a SessionStart entry as OUR tap by the script basename, not
 * the full machine path. `~/.claude/settings.json` is often synced across
 * machines (dotfiles, Claude settings sync); another machine's copy of
 * our hook has a different home/node path, so a full-path match fails to
 * see it as ours — leaving the foreign (broken-on-this-OS) command in
 * place AND appending a second current-machine entry. Matching the stable
 * basename means a foreign copy is recognised as a stale instance of the
 * same hook and gets replaced, never duplicated. This is the same
 * machine-agnostic match the statusline installer uses.
 */
const SESSION_TAP_BASENAME = path.basename(SESSION_TAP_FILE);

function isOurTapCommand(command: unknown): boolean {
  return typeof command === "string" && command.includes(SESSION_TAP_BASENAME);
}

/**
 * Copy the bundled tap script to its stable on-disk location. Source
 * is the extension's bundled `dist/session-start-tap.js`; destination
 * is `~/.claude/.claude-manager/session-start-tap.js` so the path
 * survives extension updates that change the versioned install dir.
 * Returns null once copied.
 */
function copyTapScript(extensionDistDir: string): TapFailure | null {
  const source = path.join(extensionDistDir, "session-start-tap.js");
  try {
    fs.mkdirSync(CLAUDE_MANAGER_DIR, { recursive: true });
    fs.copyFileSync(source, SESSION_TAP_FILE);
    return null;
  } catch (err) {
    return {
      ok: false,
      reason: "copy-failed",
      error: `the hook script couldn't be copied to ${SESSION_TAP_FILE} (${(err as Error).message})`,
    };
  }
}

/**
 * Read global settings.json for a read-modify-write pass, or the reason it
 * must not be rewritten — see readJsonObjectForWrite.
 *
 * Both looser answers emptied the user's settings.json. Returning `{}`
 * for an unparseable file wrote back a file holding only our hook; so
 * did returning `{}` for a freshly emptied file or a failed read, which is
 * what a window activating while Claude Code rewrites the file sees.
 */
function readSettings(): { ok: true; settings: SettingsShape } | TapFailure {
  const read = readJsonObjectForWrite(SETTINGS_FILE);
  return read.ok
    ? { ok: true, settings: read.data as SettingsShape }
    : { ok: false, reason: read.reason, error: describeReadRefusal(SETTINGS_FILE, read) };
}

/**
 * Atomic (a crash mid-write never corrupts settings.json), and through
 * a dotfile-manager symlink with the file's mode kept — see
 * writeFileAtomic.
 */
function writeSettingsAtomic(settings: SettingsShape): TapChange {
  try {
    writeFileAtomic(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
    return { ok: true, changed: true };
  } catch (err) {
    return {
      ok: false,
      reason: "write-failed",
      error: `${SETTINGS_FILE} couldn't be written (${(err as Error).message})`,
    };
  }
}

/**
 * Whether an existing tap command still works as-is: it runs THIS
 * machine's script path with a node binary that is still executable.
 * Such a command is kept even when a fresh `sessionTapCommand()` would
 * bake a different node: every window launched from another shell
 * (fnm, nvm, asdf) resolves another node path, and rewriting on each
 * one churned ~/.claude/settings.json on every activation.
 */
function isTapHealthy(command: string): boolean {
  return command.endsWith(`"${SESSION_TAP_FILE}"`) && commandNodeUsable(command);
}

/**
 * Ensure `hooks.SessionStart` contains exactly one entry pointing at
 * our tap, preserving every other user-defined SessionStart hook
 * unchanged.
 */
export function ensureSessionStartHook(extensionDistDir: string): TapChange {
  const copyFailed = copyTapScript(extensionDistDir);
  if (copyFailed) return copyFailed;

  // Refuse rather than rewrite a settings.json we cannot parse. Running
  // on every activation, a "write it back fresh" here emptied the file.
  const read = readSettings();
  if (!read.ok) return read;
  const settings = read.settings;
  const hooks = (settings.hooks ?? {}) as Record<string, SessionStartEntry[]>;
  const existing = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];

  let foundOurs = false;
  // Tracked explicitly: stripping a stale copy out of an entry that also
  // holds user hooks changes the file without changing the entry count.
  let changed = false;
  const next: SessionStartEntry[] = [];
  for (const entry of existing) {
    if (!entry || typeof entry !== "object") {
      changed = true;
      continue;
    }
    const sub = Array.isArray(entry.hooks) ? entry.hooks : [];
    const ours = sub.find(
      (s) => s && s.type === "command" && isOurTapCommand(s.command),
    );
    if (ours) {
      // One healthy entry is kept verbatim; any further copy of ours is a
      // duplicate and dropped like a stale one.
      if (!foundOurs && isTapHealthy(ours.command) && (entry.matcher ?? "") === "") {
        foundOurs = true;
        next.push(entry);
        continue;
      }
      changed = true;
      const otherSubs = sub.filter((s) => s !== ours);
      if (otherSubs.length > 0) {
        next.push({ matcher: entry.matcher, hooks: otherSubs });
      }
      continue;
    }
    next.push(entry);
  }

  if (!foundOurs) {
    next.push({
      matcher: "",
      hooks: [{ type: "command", command: sessionTapCommand() }],
    });
  } else if (!changed) {
    return UNCHANGED;
  }

  hooks.SessionStart = next;
  settings.hooks = hooks;
  return writeSettingsAtomic(settings);
}

/**
 * Whether settings.json already references our tap.
 *
 * This is the consent record. Claude Manager shipped the hook as an
 * unconditional activation write before `claudeManager.sessions.terminalLinking`
 * existed, so an installed hook is how an existing user's prior state is
 * told apart from a fresh machine that has never been written to. False
 * for an unreadable settings.json — the safe answer, since the caller
 * cannot write to that file either.
 */
export function isSessionStartHookInstalled(): boolean {
  const read = readSettings();
  if (!read.ok) return false;
  const entries = read.settings.hooks?.SessionStart;
  if (!Array.isArray(entries)) return false;
  return entries.some(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((s) => s && s.type === "command" && isOurTapCommand(s.command)),
  );
}

/**
 * Remove the tap hook from settings.json (leaves the on-disk script in
 * place — harmless once unreferenced).
 */
export function removeSessionStartHook(): TapChange {
  const read = readSettings();
  if (!read.ok) return read;
  const settings = read.settings;
  const hooks = settings.hooks;
  if (!hooks || !Array.isArray(hooks.SessionStart)) return UNCHANGED;

  const filtered: SessionStartEntry[] = [];
  let changed = false;
  for (const entry of hooks.SessionStart) {
    if (!entry || typeof entry !== "object") {
      filtered.push(entry);
      continue;
    }
    const sub = Array.isArray(entry.hooks) ? entry.hooks : [];
    // Basename match so uninstall also clears foreign-machine copies of
    // our hook that rode in via settings sync (see isOurTapCommand).
    const remaining = sub.filter((s) => !(s && s.type === "command" && isOurTapCommand(s.command)));
    if (remaining.length !== sub.length) changed = true;
    if (remaining.length > 0) filtered.push({ matcher: entry.matcher, hooks: remaining });
  }

  if (!changed) return UNCHANGED;
  if (filtered.length === 0) {
    delete hooks.SessionStart;
  } else {
    hooks.SessionStart = filtered;
  }
  settings.hooks = hooks;
  return writeSettingsAtomic(settings);
}
