/**
 * Path constants for Claude CLI data directories.
 * Pure Node.js — no VS Code dependency.
 */
import * as path from "path";
import * as os from "os";

/** Root directory for Claude CLI data (~/.claude) */
export const CLAUDE_DIR: string = path.join(os.homedir(), ".claude");

/** Path to the global history.jsonl file */
export const HISTORY_FILE: string = path.join(CLAUDE_DIR, "history.jsonl");

/** Directory containing per-project session JSONL files */
export const PROJECTS_DIR: string = path.join(CLAUDE_DIR, "projects");

/** Directory containing session name/metadata JSON files */
export const SESSIONS_DIR: string = path.join(CLAUDE_DIR, "sessions");

/** Path to the extension's user state file (pins/deletes) */
export const STATE_FILE: string = path.join(CLAUDE_DIR, ".csm-state.json");

/** Claude CLI's pre-aggregated stats cache (what /stats reads). */
export const STATS_CACHE_FILE: string = path.join(CLAUDE_DIR, "stats-cache.json");

/** Number of bytes to read from a session file for metadata extraction */
export const SESSION_META_READ_BYTES: number = 4096;
