/**
 * Install / uninstall the statusline tap (extension-host side) — scope-aware.
 *
 * Claude Code reads `statusLine.command` with the precedence
 *   local (.claude/settings.local.json) ›
 *   project (.claude/settings.json) ›
 *   global (~/.claude/settings.json)
 * so installing only at the global scope silently does nothing in any
 * repo whose project settings (or a user's local override) already
 * define a statusline. To "work everywhere" the installer must wire the
 * tap into the scope Claude actually reads — chaining whatever command
 * is there and recording the scope so uninstall reverses it exactly.
 *
 * Why copy the script to ~/.claude/ instead of pointing at the bundled
 * dist file: VS Code's extension directory is versioned, so its path
 * changes on every update and would orphan `statusLine.command`. The
 * stable path under ~/.claude/ keeps the wiring valid across updates
 * (the installer re-copies the current script each time).
 */
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import {
  CLAUDE_MANAGER_DIR,
  SETTINGS_FILE,
  STATUSLINE_CACHE_FILE,
  STATUSLINE_INNER_FILE,
  STATUSLINE_TAP_FILE,
} from "../../core/config";
import { writeSettingsValue } from "./parser";
import type { PermissionScope } from "./types";

/**
 * Resolve an absolute `node` path at install time. Claude Code runs
 * `statusLine.command` in a shell whose PATH may differ from VS Code's
 * (the classic nvm case). Baking the absolute path makes the command
 * work regardless of that shell's PATH. Falls back to bare "node" when
 * detection fails — no worse than the PATH lookup.
 */
function resolveNodePath(): string {
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const out = execFileSync(finder, ["node"], { encoding: "utf-8", timeout: 3000 });
    const first = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (first) return first;
  } catch {
    /* detection failed — fall back to PATH lookup at render time */
  }
  return "node";
}

/** The `statusLine.command` value we install — runs the copied tap. */
function tapCommand(): string {
  return `"${resolveNodePath()}" "${STATUSLINE_TAP_FILE}"`;
}

/** Settings file path for a given scope, or null when unreachable. */
function settingsPathFor(scope: PermissionScope, workspacePath?: string): string | null {
  if (scope === "global") return SETTINGS_FILE;
  if (!workspacePath) return null;
  if (scope === "project") return path.join(workspacePath, ".claude", "settings.json");
  if (scope === "local") return path.join(workspacePath, ".claude", "settings.local.json");
  return null;
}

/**
 * Return statusLine.command from one settings file. Distinguishes
 * "key absent" (null) from "explicitly empty" (""), so the caller can
 * tell where the active definition lives.
 */
function readCommandFromFile(filePath: string | null): string | null {
  if (!filePath) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  let data: { statusLine?: { command?: unknown } };
  try {
    data = JSON.parse(raw) as { statusLine?: { command?: unknown } };
  } catch {
    return null;
  }
  const sl = data.statusLine;
  if (!sl || typeof sl !== "object" || !("command" in sl)) return null;
  return typeof sl.command === "string" ? sl.command : null;
}

/**
 * Effective scope = the highest-precedence scope that defines
 * statusLine.command. local › project › global. When nothing defines
 * it, default to global (the natural place for a brand-new install).
 */
export interface EffectiveScope {
  scope: PermissionScope;
  command: string;
}

export function resolveEffectiveScope(workspacePath?: string): EffectiveScope {
  if (workspacePath) {
    const local = readCommandFromFile(settingsPathFor("local", workspacePath));
    if (local !== null) return { scope: "local", command: local };
    const project = readCommandFromFile(settingsPathFor("project", workspacePath));
    if (project !== null) return { scope: "project", command: project };
  }
  const global = readCommandFromFile(SETTINGS_FILE);
  if (global !== null) return { scope: "global", command: global };
  return { scope: "global", command: "" };
}

/** Sidecar shape recorded at install — drives a faithful uninstall. */
interface InnerRecord {
  scope: PermissionScope;
  command: string;
  /** Workspace whose project/local settings hold the recorded scope. */
  workspacePath?: string;
}

function writeInner(rec: InnerRecord): void {
  fs.writeFileSync(STATUSLINE_INNER_FILE, JSON.stringify(rec, null, 2) + "\n");
}

function readInner(): InnerRecord | null {
  try {
    const raw = fs.readFileSync(STATUSLINE_INNER_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<InnerRecord>;
    if (parsed.scope !== "global" && parsed.scope !== "project" && parsed.scope !== "local") {
      return null;
    }
    return {
      scope: parsed.scope,
      command: typeof parsed.command === "string" ? parsed.command : "",
      workspacePath:
        typeof parsed.workspacePath === "string" ? parsed.workspacePath : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * True when the effective statusLine.command points at our tap. Pass
 * `workspacePath` so project/local scopes are considered — without it,
 * only global is checked.
 */
export function isStatuslineInstalled(workspacePath?: string): boolean {
  return resolveEffectiveScope(workspacePath).command.includes(STATUSLINE_TAP_FILE);
}

export type InstallResult = { ok: true } | { ok: false; error: string };

/**
 * Install the tap into the effective scope so it actually wins. Records
 * the prior command + its scope in the sidecar so uninstall restores
 * the exact prior state. Idempotent: re-running refreshes the copied
 * script without clobbering the recorded original.
 */
/**
 * Clear our tap from every scope that has it. Used by install (to drop
 * an orphan from a previous install at a now-non-effective scope) and
 * by uninstall (to be sure no leftover survives anywhere). Skips the
 * scope passed in `keep` (the one install is about to write to).
 */
function clearTapFromOtherScopes(workspacePath?: string, keep?: PermissionScope): void {
  for (const scope of ["global", "project", "local"] as PermissionScope[]) {
    if (scope === keep) continue;
    const filePath = settingsPathFor(scope, workspacePath);
    const cmd = readCommandFromFile(filePath);
    if (cmd !== null && cmd.includes(STATUSLINE_TAP_FILE)) {
      writeSettingsValue("statusLine.command", "", scope, workspacePath);
    }
  }
}

export function installStatusline(
  tapSourcePath: string,
  workspacePath?: string,
): InstallResult {
  try {
    fs.mkdirSync(CLAUDE_MANAGER_DIR, { recursive: true });
    fs.copyFileSync(tapSourcePath, STATUSLINE_TAP_FILE);

    const eff = resolveEffectiveScope(workspacePath);
    const alreadyOurs = eff.command.includes(STATUSLINE_TAP_FILE);
    if (!alreadyOurs) {
      writeInner({ scope: eff.scope, command: eff.command, workspacePath });
    }

    const ok = writeSettingsValue(
      "statusLine.command",
      tapCommand(),
      eff.scope,
      workspacePath,
    );
    // Drop orphan tap entries from other scopes — e.g. a prior global
    // install when the effective scope is now project. Keeps the final
    // state "tap lives in exactly one place" so uninstall is unambiguous.
    clearTapFromOtherScopes(workspacePath, eff.scope);
    return ok ? { ok: true } : { ok: false, error: "settings-write-failed" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Remove the tap and restore the prior command at the recorded scope.
 * Restoring an empty command deletes the key (matching the pre-install
 * "no statusline at this scope" state). Best-effort cleanup of our own
 * files — a leftover cache file is harmless.
 */
export function uninstallStatusline(workspacePath?: string): InstallResult {
  try {
    const rec = readInner();
    if (rec) {
      writeSettingsValue(
        "statusLine.command",
        rec.command,
        rec.scope,
        rec.workspacePath ?? workspacePath,
      );
    }
    // Belt-and-braces: ensure no scope still holds the tap after the
    // restore. The sidecar may be missing entirely, or a re-install at
    // a different scope may have left an orphan elsewhere.
    clearTapFromOtherScopes(workspacePath);

    for (const f of [STATUSLINE_INNER_FILE, STATUSLINE_TAP_FILE, STATUSLINE_CACHE_FILE]) {
      try {
        fs.rmSync(f);
      } catch {
        /* already gone — fine */
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
