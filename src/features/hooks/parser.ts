/**
 * Hook parsing — reads Claude Code hooks from global, project, and local settings files.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Hook, HookScope } from "./types";

/** Path to the global settings file (~/.claude/settings.json). */
const GLOBAL_SETTINGS_FILE: string = path.join(os.homedir(), ".claude", "settings.json");

/**
 * Read hooks from a settings.json file at the given path.
 * Returns an empty array if the file is missing, invalid, or has no hooks.
 *
 * @param filePath - Absolute path to a settings.json file
 * @param scope - Source label for the parsed hooks
 */
function readHooksFromFile(filePath: string, scope: HookScope): Hook[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to read settings file ${filePath}:`, (err as Error).message);
    }
    return [];
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    console.warn(`[claude-manager] Failed to parse ${filePath}:`, (err as Error).message);
    return [];
  }

  const hooksObj = settings.hooks;
  if (!hooksObj || typeof hooksObj !== "object" || Array.isArray(hooksObj)) {
    return [];
  }

  const hooks: Hook[] = [];
  const hooksMap = hooksObj as Record<string, unknown>;

  // Hooks can be in two formats:
  // Format A (flat):  { "PreToolUse": [{ matcher, command }] }
  // Format B (nested): { "Stop": [{ matcher, hooks: [{ type, command }] }] }
  for (const [event, entries] of Object.entries(hooksMap)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      const matcher = typeof rec.matcher === "string" ? rec.matcher : "";

      // Format B: nested hooks array
      if (Array.isArray(rec.hooks)) {
        for (const sub of rec.hooks) {
          if (!sub || typeof sub !== "object") continue;
          const subRec = sub as Record<string, unknown>;
          const command = typeof subRec.command === "string" ? subRec.command : "";
          if (!command) continue;
          hooks.push({ event, matcher, command, scope });
        }
        continue;
      }

      // Format A: flat command field
      const command = typeof rec.command === "string" ? rec.command : "";
      if (!command) continue;
      hooks.push({ event, matcher, command, scope });
    }
  }

  return hooks;
}

/**
 * Parse all hooks from global, project, and local settings files.
 *
 * Reads from:
 * - ~/.claude/settings.json (global)
 * - <workspace>/.claude/settings.json (project)
 * - <workspace>/.claude/settings.local.json (local, gitignored)
 *
 * @param workspacePath - Absolute path to the current workspace folder. Optional.
 * @returns Array of all discovered hooks across all scopes.
 */
export function parseHooks(workspacePath?: string): Hook[] {
  const hooks: Hook[] = [];

  // Global hooks
  hooks.push(...readHooksFromFile(GLOBAL_SETTINGS_FILE, "global"));

  // Project + local hooks
  if (workspacePath) {
    const projectSettings = path.join(workspacePath, ".claude", "settings.json");
    const localSettings = path.join(workspacePath, ".claude", "settings.local.json");
    hooks.push(...readHooksFromFile(projectSettings, "project"));
    hooks.push(...readHooksFromFile(localSettings, "local"));
  }

  return hooks;
}
