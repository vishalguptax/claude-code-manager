/**
 * Install the SessionStart hook tap into the user's global Claude
 * settings. Copies the bundled `dist/session-start-tap.js` to a stable
 * path under `~/.claude/.claude-manager/` (survives extension updates)
 * and ensures `hooks.SessionStart` contains an entry that runs it.
 *
 * Idempotent: re-running refreshes the copied script but leaves the
 * settings entry alone unless the command line changed.
 *
 * Global scope only — SessionStart fires for every session anywhere on
 * the box, so per-project installs would multi-fire from overlapping
 * project / local settings. Global is the one scope Claude CLI reads
 * unconditionally.
 */
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import {
  CLAUDE_MANAGER_DIR,
  SESSION_TAP_FILE,
  SETTINGS_FILE,
} from "../../core/config";

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
 * Resolve an absolute `node` path. Claude CLI runs the hook in a shell
 * whose PATH may differ from VS Code's; baking the absolute path makes
 * the command work even when the user's interactive PATH doesn't
 * surface node (the classic nvm + non-interactive shell case).
 */
function resolveNodePath(): string {
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const out = execFileSync(finder, ["node"], { encoding: "utf-8", timeout: 3000 });
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (first) return first;
  } catch {
    /* fall through to PATH-relative invocation */
  }
  return "node";
}

/** The shell command Claude CLI runs for the SessionStart hook. */
export function sessionTapCommand(): string {
  return `"${resolveNodePath()}" "${SESSION_TAP_FILE}"`;
}

/**
 * Copy the bundled tap script to its stable on-disk location. Source
 * is the extension's bundled `dist/session-start-tap.js`; destination
 * is `~/.claude/.claude-manager/session-start-tap.js` so the path
 * survives extension updates that change the versioned install dir.
 */
function copyTapScript(extensionDistDir: string): boolean {
  const source = path.join(extensionDistDir, "session-start-tap.js");
  try {
    fs.mkdirSync(CLAUDE_MANAGER_DIR, { recursive: true });
    fs.copyFileSync(source, SESSION_TAP_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read global settings.json, tolerating missing file / parse error by
 * returning an empty object — the caller writes it back fresh.
 */
function readSettings(): SettingsShape {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SettingsShape;
    }
  } catch {
    /* fall through */
  }
  return {};
}

/** Atomic write so a crash mid-write never corrupts settings.json. */
function writeSettingsAtomic(settings: SettingsShape): void {
  const tmp = `${SETTINGS_FILE}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(settings, null, 2)}\n`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, SETTINGS_FILE);
}

/**
 * Ensure `hooks.SessionStart` contains exactly one entry pointing at
 * our tap, preserving every other user-defined SessionStart hook
 * unchanged. Returns true when settings.json was modified.
 */
export function ensureSessionStartHook(extensionDistDir: string): boolean {
  if (!copyTapScript(extensionDistDir)) return false;
  const expectedCommand = sessionTapCommand();

  const settings = readSettings();
  const hooks = (settings.hooks ?? {}) as Record<string, SessionStartEntry[]>;
  const existing = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];

  let foundOurs = false;
  const next: SessionStartEntry[] = [];
  for (const entry of existing) {
    if (!entry || typeof entry !== "object") continue;
    const sub = Array.isArray(entry.hooks) ? entry.hooks : [];
    const ours = sub.find(
      (s) => s && s.type === "command" && typeof s.command === "string" && s.command.includes(SESSION_TAP_FILE),
    );
    if (ours) {
      if (ours.command === expectedCommand && (entry.matcher ?? "") === "") {
        foundOurs = true;
        next.push(entry);
        continue;
      }
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
      hooks: [{ type: "command", command: expectedCommand }],
    });
  } else if (next.length === existing.length) {
    return false;
  }

  hooks.SessionStart = next;
  settings.hooks = hooks;
  try {
    writeSettingsAtomic(settings);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the tap hook from settings.json (leaves the on-disk script in
 * place — harmless once unreferenced). Returns true when settings.json
 * was modified.
 */
export function removeSessionStartHook(): boolean {
  const settings = readSettings();
  const hooks = settings.hooks;
  if (!hooks || !Array.isArray(hooks.SessionStart)) return false;

  const filtered: SessionStartEntry[] = [];
  let changed = false;
  for (const entry of hooks.SessionStart) {
    if (!entry || typeof entry !== "object") {
      filtered.push(entry);
      continue;
    }
    const sub = Array.isArray(entry.hooks) ? entry.hooks : [];
    const remaining = sub.filter(
      (s) => !(s && s.type === "command" && typeof s.command === "string" && s.command.includes(SESSION_TAP_FILE)),
    );
    if (remaining.length !== sub.length) changed = true;
    if (remaining.length > 0) filtered.push({ matcher: entry.matcher, hooks: remaining });
  }

  if (!changed) return false;
  if (filtered.length === 0) {
    delete hooks.SessionStart;
  } else {
    hooks.SessionStart = filtered;
  }
  settings.hooks = hooks;
  try {
    writeSettingsAtomic(settings);
    return true;
  } catch {
    return false;
  }
}
