/**
 * Core barrel export — shared types, config, and pure utilities.
 * No VS Code dependency in this module.
 */
export { CLAUDE_DIR, HISTORY_FILE, PROJECTS_DIR, SESSIONS_DIR, STATE_FILE, SESSION_META_READ_BYTES } from "./config";
export type { UserState } from "./types";
export { normPath, getNonce } from "./utils";
export { createMtimeCache } from "./mtimeCache";
export type { MtimeCache } from "./mtimeCache";
