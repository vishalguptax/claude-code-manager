/**
 * Install / uninstall the statusline tap (extension-host side) — global-first.
 *
 * Claude Code reads `statusLine.command` with the precedence
 *   local (.claude/settings.local.json) ›
 *   project (.claude/settings.json) ›
 *   global (~/.claude/settings.json)
 *
 * Strategy: the tap installs at the GLOBAL scope (quota is a
 * machine-wide feature — one write covers every project). Where a
 * workspace's project/local settings shadow the global command, a
 * LOCAL-scope override is added for that workspace, chaining the
 * shadowing command so the user's statusline design keeps rendering.
 *
 * The shared, git-committed PROJECT settings file is NEVER written:
 * the tap command embeds machine-absolute paths (node binary, home
 * dir) that break every other contributor's statusline. A tap entry
 * found at project scope (committed by a pre-fix version) is treated
 * as poison and repaired — replaced with the recorded prior command,
 * or removed.
 *
 * Why copy the script to ~/.claude/ instead of pointing at the bundled
 * dist file: VS Code's extension directory is versioned, so its path
 * changes on every update and would orphan `statusLine.command`. The
 * stable path under ~/.claude/ keeps the wiring valid across updates
 * (self-heal re-copies the script when its bytes change).
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
import { writeFileAtomic } from "../../core/atomicWrite";
import { writeSettingsValue } from "./parser";
import {
  isTapCommand,
  isV2,
  parseInner,
  type InnerRecordV1,
  type InnerRecordV2,
} from "./statuslineInner";
import type { PermissionScope } from "./types";

/**
 * Resolve an absolute `node` path at install time. Claude Code runs
 * `statusLine.command` in a shell whose PATH may differ from VS Code's
 * (the classic nvm case). Baking the absolute path makes the command
 * work regardless of that shell's PATH. Falls back to bare "node" when
 * detection fails — no worse than the PATH lookup.
 */
let cachedNodePath: string | null = null;

function resolveNodePath(): string {
  // Memoised: node's location is stable for the session, so the `where`/`which`
  // spawn runs at most once instead of on every install click (installStatusline
  // is a user-triggered action; re-spawning each time added avoidable latency).
  if (cachedNodePath !== null) return cachedNodePath;
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const out = execFileSync(finder, ["node"], { encoding: "utf-8", timeout: 3000 });
    const first = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (first) {
      cachedNodePath = first;
      return first;
    }
  } catch {
    /* detection failed — fall back to PATH lookup at render time */
  }
  cachedNodePath = "node";
  return cachedNodePath;
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
 * Enterprise managed settings out-precede every user scope. When they
 * define a statusline, nothing we write can take effect — surface that
 * instead of installing dead wiring.
 */
function managedSettingsPath(): string {
  if (process.platform === "darwin") {
    return "/Library/Application Support/ClaudeCode/managed-settings.json";
  }
  if (process.platform === "win32") {
    return "C:\\ProgramData\\ClaudeCode\\managed-settings.json";
  }
  return "/etc/claude-code/managed-settings.json";
}

function managedStatuslineDefined(): boolean {
  return readCommandFromFile(managedSettingsPath()) !== null;
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

// ── Sidecar IO ──

function readInnerAny(): InnerRecordV2 | InnerRecordV1 | null {
  try {
    return parseInner(fs.readFileSync(STATUSLINE_INNER_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function writeInner(rec: InnerRecordV2): void {
  fs.mkdirSync(CLAUDE_MANAGER_DIR, { recursive: true });
  writeFileAtomic(STATUSLINE_INNER_FILE, JSON.stringify(rec, null, 2) + "\n");
}

/**
 * Convert a v1 single-record sidecar into v2. A v1 record whose scope
 * was PROJECT is the committed-machine-path bug — repair the shared
 * file by restoring the recorded prior command (empty prior deletes
 * the key), and carry the prior into a workspace override so the
 * global-first ensure pass re-shadows it at local.
 */
function migrateV1(rec: InnerRecordV1): InnerRecordV2 {
  const v2: InnerRecordV2 = { version: 2, global: null, workspaces: {} };
  if (rec.scope === "global") {
    v2.global = { priorCommand: rec.command };
  } else if (rec.workspacePath) {
    if (rec.scope === "project") {
      writeSettingsValue("statusLine.command", rec.command, "project", rec.workspacePath);
    }
    v2.workspaces[rec.workspacePath] = {
      sourceScope: rec.scope === "project" ? "project" : "local",
      priorCommand: rec.command,
    };
  }
  return v2;
}

// ── Health checks ──

/** Extract the quoted node path from a tap command, "" when bare. */
function nodePathFromCommand(command: string): string {
  const m = /^"([^"]+)"/.exec(command);
  return m ? m[1] : "";
}

/**
 * "Working on THIS machine": exact tap path + the baked node binary
 * still exists (an nvm version switch can delete it — the command
 * would still contain the right tap path but never run).
 */
function isTapHealthy(command: string): boolean {
  if (!command.includes(STATUSLINE_TAP_FILE)) return false;
  const node = nodePathFromCommand(command);
  if (!node || node === "node") return true;
  return fs.existsSync(node);
}

/**
 * True when the effective statusLine.command points at our tap and is
 * runnable on this machine. Pass `workspacePath` so project/local
 * scopes are considered — without it, only global is checked.
 */
export function isStatuslineInstalled(workspacePath?: string): boolean {
  return isTapHealthy(resolveEffectiveScope(workspacePath).command);
}

/**
 * A tap-shaped command sitting in the shared project settings — either
 * this machine's (pre-fix install) or another machine's (committed by
 * a teammate). Breaks the statusline for everyone else; the caller
 * offers a one-click removal.
 */
export function detectForeignProjectTap(workspacePath?: string): boolean {
  const cmd = readCommandFromFile(settingsPathFor("project", workspacePath));
  return cmd !== null && isTapCommand(cmd);
}

/** Remove a tap entry from the shared project settings (user-approved). */
export function removeForeignProjectTap(workspacePath?: string): boolean {
  if (!detectForeignProjectTap(workspacePath)) return false;
  return writeSettingsValue("statusLine.command", "", "project", workspacePath);
}

export type InstallResult = { ok: true; repairedProject?: boolean } | { ok: false; error: string };

/**
 * Idempotent convergence pass — shared by the Enable click and
 * activation self-heal. Refreshes the copied script, wires the global
 * scope, adds/repairs the workspace's local override when shadowed,
 * repairs a poisoned project entry, prunes dead workspace records, and
 * persists the v2 sidecar.
 */
function ensureInstalled(tapSourcePath: string, workspacePath?: string): InstallResult {
  try {
    if (managedStatuslineDefined()) {
      return { ok: false, error: "managed-by-org" };
    }

    // 1. Copy / refresh the tap script (byte-compare so extension
    //    updates ship tap fixes without a re-enable).
    fs.mkdirSync(CLAUDE_MANAGER_DIR, { recursive: true });
    let stale = true;
    try {
      stale =
        fs.readFileSync(tapSourcePath, "utf-8") !==
        fs.readFileSync(STATUSLINE_TAP_FILE, "utf-8");
    } catch {
      // copy missing or source unreadable — attempt the copy
    }
    if (stale) fs.copyFileSync(tapSourcePath, STATUSLINE_TAP_FILE);

    // 2. Sidecar: load, migrating v1 (which may repair a poisoned
    //    project entry recorded by the pre-fix installer).
    const prev = readInnerAny();
    const rec: InnerRecordV2 =
      prev === null
        ? { version: 2, global: null, workspaces: {} }
        : isV2(prev)
          ? prev
          : migrateV1(prev);

    // 3. Global scope — the primary install target.
    const globalCmd = readCommandFromFile(SETTINGS_FILE);
    if (globalCmd === null || !isTapHealthy(globalCmd)) {
      if (rec.global === null) {
        // Record the user's command as the chain/restore target —
        // unless it's a (stale/foreign) tap, which must never be
        // chained or restored.
        rec.global = {
          priorCommand: globalCmd !== null && !isTapCommand(globalCmd) ? globalCmd : "",
        };
      }
      if (!writeSettingsValue("statusLine.command", tapCommand(), "global")) {
        return { ok: false, error: "settings-write-failed" };
      }
    } else if (rec.global === null) {
      // Healthy tap but no record (sidecar lost) — nothing to chain.
      rec.global = { priorCommand: "" };
    }

    // 4. Workspace pass.
    let repairedProject = false;
    if (workspacePath) {
      let projectCmd = readCommandFromFile(settingsPathFor("project", workspacePath));

      // Poisoned shared file: replace the tap entry with the recorded
      // prior command (empty prior deletes the key entirely).
      if (projectCmd !== null && isTapCommand(projectCmd)) {
        const existing = rec.workspaces[workspacePath];
        const prior = existing?.sourceScope === "project" ? existing.priorCommand : "";
        writeSettingsValue("statusLine.command", prior, "project", workspacePath);
        projectCmd = prior || null;
        repairedProject = true;
      }

      const localCmd = readCommandFromFile(settingsPathFor("local", workspacePath));
      if (localCmd !== null) {
        if (!isTapHealthy(localCmd)) {
          if (!isTapCommand(localCmd)) {
            // The user's own local statusline shadows the global tap —
            // take over the slot and chain their command.
            rec.workspaces[workspacePath] = {
              sourceScope: "local",
              priorCommand: localCmd,
            };
          } else if (!rec.workspaces[workspacePath]) {
            // Our tap (stale node path / other machine) with no record:
            // chain the project's command if one exists.
            rec.workspaces[workspacePath] = {
              sourceScope: "project",
              priorCommand: projectCmd ?? "",
            };
          }
          writeSettingsValue("statusLine.command", tapCommand(), "local", workspacePath);
        }
      } else if (projectCmd !== null) {
        // Project statusline (possibly "") shadows the global tap —
        // out-precede it at local, chaining the project's command.
        rec.workspaces[workspacePath] = {
          sourceScope: "project",
          priorCommand: projectCmd,
        };
        writeSettingsValue("statusLine.command", tapCommand(), "local", workspacePath);
      } else if (rec.workspaces[workspacePath]) {
        // No shadowing anymore (user removed their local/project
        // statusline) — the stale override record would misdirect a
        // future uninstall.
        delete rec.workspaces[workspacePath];
      }
    }

    // 5. Prune records for workspaces that no longer exist on disk.
    for (const ws of Object.keys(rec.workspaces)) {
      if (!fs.existsSync(ws)) delete rec.workspaces[ws];
    }

    writeInner(rec);
    return { ok: true, repairedProject };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function installStatusline(
  tapSourcePath: string,
  workspacePath?: string,
): InstallResult {
  return ensureInstalled(tapSourcePath, workspacePath);
}

/**
 * Activation-time maintenance of an existing opt-in. No sidecar =
 * user never enabled = strictly no action (installing is consent-
 * gated). With a sidecar, converge: re-wire reverted settings, refresh
 * stale script bytes, re-resolve a dead node path, extend coverage to
 * a newly-opened shadowed workspace, repair poisoned project entries.
 */
export function selfHealStatusline(
  tapSourcePath: string,
  workspacePath?: string,
): InstallResult {
  if (readInnerAny() === null) return { ok: true };
  return ensureInstalled(tapSourcePath, workspacePath);
}

/**
 * Remove the tap everywhere the sidecar says it was installed and
 * restore each slot's prior command. A slot is only rewritten when it
 * still holds a tap command — a value the user replaced by hand stays
 * untouched. Best-effort cleanup of our own files — a leftover cache
 * file is harmless (an in-flight render may even recreate it; the
 * settings no longer point at the tap, so it goes quiet immediately).
 */
export function uninstallStatusline(workspacePath?: string): InstallResult {
  try {
    const prev = readInnerAny();
    const rec: InnerRecordV2 | null =
      prev === null ? null : isV2(prev) ? prev : migrateV1(prev);

    if (rec) {
      const globalCmd = readCommandFromFile(SETTINGS_FILE);
      if (globalCmd !== null && isTapCommand(globalCmd)) {
        writeSettingsValue(
          "statusLine.command",
          rec.global?.priorCommand ?? "",
          "global",
        );
      }
      for (const [ws, o] of Object.entries(rec.workspaces)) {
        const localCmd = readCommandFromFile(settingsPathFor("local", ws));
        if (localCmd !== null && isTapCommand(localCmd)) {
          // sourceScope "project": we created the local key — delete it
          // (project supplies the command again). "local": restore the
          // user's own command.
          writeSettingsValue(
            "statusLine.command",
            o.sourceScope === "local" ? o.priorCommand : "",
            "local",
            ws,
          );
        }
      }
    }

    // Belt-and-braces sweep of the current workspace + global for any
    // stray tap entry the sidecar didn't know about (including foreign
    // machines' paths in the shared project file).
    for (const scope of ["global", "project", "local"] as PermissionScope[]) {
      const cmd = readCommandFromFile(settingsPathFor(scope, workspacePath));
      if (cmd !== null && isTapCommand(cmd)) {
        writeSettingsValue("statusLine.command", "", scope, workspacePath);
      }
    }

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
