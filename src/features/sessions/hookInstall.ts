/**
 * Install and remove this extension's command hooks in the user's global
 * Claude settings. Each hook is a bundled Node script copied to a stable
 * path under `~/.claude/.claude-manager/` (survives extension updates) and
 * an entry under `hooks.<Event>` that runs it.
 *
 * Idempotent: re-running refreshes the copied script but leaves a settings
 * entry alone while it still works (see isHookHealthy).
 *
 * Nothing here decides WHETHER a hook may exist — each hook's policy module
 * gates every call on the user's consent. These functions only carry a
 * decision out.
 *
 * Global scope only — a hook fires for every session anywhere on the box,
 * so per-project installs would multi-fire from overlapping project / local
 * settings. Global is the one scope Claude CLI reads unconditionally.
 */
import * as fs from "fs";
import * as path from "path";
import { CLAUDE_MANAGER_DIR, SETTINGS_FILE } from "../../core/config";
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

interface HookEntry {
  matcher?: string;
  hooks?: HookCommandEntry[];
}

interface SettingsShape {
  hooks?: Record<string, HookEntry[]>;
  [k: string]: unknown;
}

/** One hook of ours: the event it runs on and the installed script it runs. */
export interface HookSpec {
  event: string;
  scriptFile: string;
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

/** The shell command Claude CLI runs for a hook script. */
export function hookCommand(scriptFile: string): string {
  return `"${resolveNodePath()}" "${scriptFile}"`;
}

/**
 * Recognise a hook entry as OURS by the script basename, not the full
 * machine path. `~/.claude/settings.json` is often synced across machines
 * (dotfiles, Claude settings sync); another machine's copy of our hook has a
 * different home/node path, so a full-path match fails to see it as ours —
 * leaving the foreign (broken-on-this-OS) command in place AND appending a
 * second current-machine entry. Matching the stable basename means a foreign
 * copy is recognised as a stale instance of the same hook and gets replaced,
 * never duplicated. This is the same machine-agnostic match the statusline
 * installer uses.
 */
function isOurCommand(command: unknown, scriptFile: string): boolean {
  return typeof command === "string" && command.includes(path.basename(scriptFile));
}

/**
 * Whether an existing command still works as-is: it runs THIS machine's
 * script path with a node binary that is still executable. Such a command is
 * kept even when a fresh `hookCommand()` would bake a different node: every
 * window launched from another shell (fnm, nvm, asdf) resolves another node
 * path, and rewriting on each one churned ~/.claude/settings.json on every
 * activation.
 */
function isHookHealthy(command: string, scriptFile: string): boolean {
  return command.endsWith(`"${scriptFile}"`) && commandNodeUsable(command);
}

/**
 * Copy a bundled hook script (`dist/<bundleName>`) to its stable on-disk
 * location, so the path survives extension updates that change the
 * versioned install dir. Returns null once copied.
 */
export function copyHookScript(
  extensionDistDir: string,
  bundleName: string,
  scriptFile: string,
): TapFailure | null {
  const source = path.join(extensionDistDir, bundleName);
  try {
    fs.mkdirSync(CLAUDE_MANAGER_DIR, { recursive: true });
    fs.copyFileSync(source, scriptFile);
    return null;
  } catch (err) {
    return {
      ok: false,
      reason: "copy-failed",
      error: `the hook script couldn't be copied to ${scriptFile} (${(err as Error).message})`,
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
 * Give `hooks[spec.event]` exactly one healthy entry running our script,
 * preserving every other hook on that event unchanged. Returns whether the
 * hooks object changed.
 */
function withHook(hooks: Record<string, HookEntry[]>, spec: HookSpec): boolean {
  const existing = Array.isArray(hooks[spec.event]) ? hooks[spec.event] : [];

  let foundOurs = false;
  // Tracked explicitly: stripping a stale copy out of an entry that also
  // holds user hooks changes the file without changing the entry count.
  let changed = false;
  const next: HookEntry[] = [];
  for (const entry of existing) {
    if (!entry || typeof entry !== "object") {
      changed = true;
      continue;
    }
    const sub = Array.isArray(entry.hooks) ? entry.hooks : [];
    const ours = sub.find(
      (s) => s && s.type === "command" && isOurCommand(s.command, spec.scriptFile),
    );
    if (ours) {
      // One healthy entry is kept verbatim; any further copy of ours is a
      // duplicate and dropped like a stale one.
      if (
        !foundOurs &&
        isHookHealthy(ours.command, spec.scriptFile) &&
        (entry.matcher ?? "") === ""
      ) {
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
      hooks: [{ type: "command", command: hookCommand(spec.scriptFile) }],
    });
  } else if (!changed) {
    return false;
  }
  hooks[spec.event] = next;
  return true;
}

/**
 * Drop every entry of ours from `hooks[spec.event]`, keeping the user's own
 * hooks. Returns whether the hooks object changed.
 */
function withoutHook(hooks: Record<string, HookEntry[]>, spec: HookSpec): boolean {
  const entries = hooks[spec.event];
  if (!Array.isArray(entries)) return false;

  const filtered: HookEntry[] = [];
  let changed = false;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      filtered.push(entry);
      continue;
    }
    const sub = Array.isArray(entry.hooks) ? entry.hooks : [];
    // Basename match so uninstall also clears foreign-machine copies of
    // our hook that rode in via settings sync (see isOurCommand).
    const remaining = sub.filter(
      (s) => !(s && s.type === "command" && isOurCommand(s.command, spec.scriptFile)),
    );
    if (remaining.length !== sub.length) changed = true;
    if (remaining.length > 0) filtered.push({ matcher: entry.matcher, hooks: remaining });
  }

  if (!changed) return false;
  if (filtered.length === 0) {
    delete hooks[spec.event];
  } else {
    hooks[spec.event] = filtered;
  }
  return true;
}

/**
 * Ensure each spec's event runs our script, in one settings.json write.
 * Refuses rather than rewrites a settings.json it cannot parse: running on
 * every activation, a "write it back fresh" there emptied the file.
 */
export function ensureHooks(specs: readonly HookSpec[]): TapChange {
  const read = readSettings();
  if (!read.ok) return read;
  const settings = read.settings;
  const hooks = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
  let changed = false;
  for (const spec of specs) changed = withHook(hooks, spec) || changed;
  if (!changed) return UNCHANGED;
  settings.hooks = hooks;
  return writeSettingsAtomic(settings);
}

/**
 * Remove each spec's hook from settings.json (leaves the on-disk script in
 * place — harmless once unreferenced).
 */
export function removeHooks(specs: readonly HookSpec[]): TapChange {
  const read = readSettings();
  if (!read.ok) return read;
  const settings = read.settings;
  const hooks = settings.hooks;
  if (!hooks) return UNCHANGED;
  let changed = false;
  for (const spec of specs) changed = withoutHook(hooks, spec) || changed;
  if (!changed) return UNCHANGED;
  settings.hooks = hooks;
  return writeSettingsAtomic(settings);
}

/**
 * Whether settings.json references our script on the spec's event. False
 * for an unreadable settings.json — the safe answer, since the caller
 * cannot write to that file either.
 */
export function isHookInstalled(spec: HookSpec): boolean {
  const read = readSettings();
  if (!read.ok) return false;
  const entries = read.settings.hooks?.[spec.event];
  if (!Array.isArray(entries)) return false;
  return entries.some(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some(
        (s) => s && s.type === "command" && isOurCommand(s.command, spec.scriptFile),
      ),
  );
}
