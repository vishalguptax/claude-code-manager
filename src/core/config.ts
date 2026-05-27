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

/** Global Claude CLI settings file (~/.claude/settings.json). */
export const SETTINGS_FILE: string = path.join(CLAUDE_DIR, "settings.json");

/** Number of bytes to read from a session file for metadata extraction */
export const SESSION_META_READ_BYTES: number = 4096;

/**
 * Where settings.json snapshots are kept before each mutation. Lives
 * under ~/.claude/ (not the workspace) so it survives `git clean` and
 * project switches. The directory is rotated to keep the most recent
 * N entries per scope; see src/features/account/snapshots.ts.
 */
export const SETTINGS_SNAPSHOTS_DIR: string = path.join(
  CLAUDE_DIR,
  ".claude-manager-snapshots",
);

/**
 * Claude Manager's own state directory under ~/.claude. Holds the
 * statusline tap script + the cache it writes. Lives beside Claude
 * CLI's own files so the tap (a separate Node process spawned by
 * Claude Code) can find it without knowing the extension install path.
 */
export const CLAUDE_MANAGER_DIR: string = path.join(CLAUDE_DIR, ".claude-manager");

/**
 * Cache the statusline tap writes on every render: live rate-limit
 * windows, current model, context-window usage, and session cost —
 * data Claude Code computes server-side and hands its statusline.
 * Reading this file is how Claude Manager surfaces 5h/7d quota WITHOUT
 * a network call or the OAuth token: Claude Code (the authorized
 * client) fetches it, the tap caches it, we read the cache.
 */
export const STATUSLINE_CACHE_FILE: string = path.join(
  CLAUDE_MANAGER_DIR,
  "statusline.json",
);

/**
 * Stable on-disk location of the tap script. The installer copies the
 * bundled script here and points `statusLine.command` at it, so the
 * path survives extension updates (which change the versioned
 * extension directory).
 */
export const STATUSLINE_TAP_FILE: string = path.join(
  CLAUDE_MANAGER_DIR,
  "statusline-tap.js",
);

/**
 * Sidecar that records the user's original `statusLine.command` when
 * the tap is installed, so the tap can chain it and uninstall can
 * restore it exactly.
 */
export const STATUSLINE_INNER_FILE: string = path.join(
  CLAUDE_MANAGER_DIR,
  "statusline-inner.json",
);
