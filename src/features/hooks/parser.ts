/**
 * Hook parsing — reads Claude Code hooks from settings.json.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Hook } from "./types";

/** Path to the Claude Code global settings file. */
const SETTINGS_FILE: string = path.join(os.homedir(), ".claude", "settings.json");

/**
 * Parse all hooks from the Claude Code settings.json file.
 * Reads the `hooks` key which maps event names to arrays of hook entries.
 *
 * Expected structure in settings.json:
 * ```json
 * {
 *   "hooks": {
 *     "PreToolUse": [{ "matcher": "...", "command": "..." }],
 *     "PostToolUse": [{ "matcher": "...", "command": "..." }]
 *   }
 * }
 * ```
 *
 * @returns Array of all discovered hooks. Returns an empty array if no hooks
 *   are configured or the settings file cannot be read.
 */
export function parseHooks(): Hook[] {
  let raw: string;
  try {
    raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to read settings file ${SETTINGS_FILE}:`, (err as Error).message);
    }
    return [];
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    console.warn(`[claude-manager] Failed to parse settings.json:`, (err as Error).message);
    return [];
  }

  const hooksObj = settings.hooks;
  if (!hooksObj || typeof hooksObj !== "object" || Array.isArray(hooksObj)) {
    return [];
  }

  const hooks: Hook[] = [];
  const hooksMap = hooksObj as Record<string, unknown>;

  for (const [event, entries] of Object.entries(hooksMap)) {
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      const matcher = typeof rec.matcher === "string" ? rec.matcher : "";
      const command = typeof rec.command === "string" ? rec.command : "";
      if (!command) continue;

      hooks.push({ event, matcher, command });
    }
  }

  return hooks;
}
