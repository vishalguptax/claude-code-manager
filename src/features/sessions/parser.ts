/**
 * Session parsing — reads Claude CLI data files and builds session objects.
 * Pure Node.js file I/O, no VS Code dependency.
 *
 * Performance notes:
 * - history.jsonl is read line-by-line without loading the entire file into memory.
 * - Session metadata (branch, entrypoint, rename, summary) is extracted in a
 *   single bounded read per file to avoid loading multi-MB transcripts.
 * - The session file index is built once per parseSessions() call and cached.
 * - parseSessionDetail() caps messages to avoid sending huge payloads to the webview.
 */
import * as fs from "fs";
import * as path from "path";
import {
  HISTORY_FILE,
  PROJECTS_DIR,
  SESSIONS_DIR,
  SESSION_META_READ_BYTES,
} from "../../core/config";
import { createMtimeCache } from "../../core/mtimeCache";
import { deslugifyProjectPath } from "./portable";
import type {
  HistoryEntry,
  Session,
  SessionDetail,
  SessionEntry,
  SessionGroup,
  Message,
  Stats,
  ToolUseBlock,
} from "./types";

/**
 * Produce a short, human-readable argument hint from a tool's input
 * object. We don't dump the full JSON — detail view renders one line
 * per tool call, so it only needs the piece that tells the user
 * "what file / command / pattern". Fields picked match Claude's
 * built-in tool schemas observed in real transcripts.
 */
function summariseToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  // Normalised field order — first match wins. Keeps parser
  // resilient to new tools: a new tool with `file_path` or
  // `command` gets a sensible default without a code change.
  const pick = (keys: string[]): string => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const primary = pick([
    "command",       // Bash
    "file_path",     // Read / Edit / Write
    "path",          // alternate Read
    "pattern",       // Grep / Glob
    "url",           // WebFetch
    "query",         // WebSearch
    "description",   // TaskCreate
    "prompt",        // Agent
    "notebook_path", // NotebookEdit
  ]);
  if (primary) {
    // Cap length — arg shown on one row in the detail view, so an
    // absurdly long command shouldn't stretch the panel.
    return primary.length > 120 ? primary.slice(0, 117) + "…" : primary;
  }
  // Fallback: first string value we find so something meaningful
  // surfaces for MCP tools we don't recognise.
  for (const v of Object.values(o)) {
    if (typeof v === "string" && v.trim()) {
      return v.length > 120 ? v.slice(0, 117) + "…" : v;
    }
  }
  return "";
}

/** Maximum bytes to read from a session file when extracting name hints (rename/summary). */
const NAME_HINT_READ_BYTES = 256 * 1024; // 256 KB — covers most sessions

/** Maximum messages returned per detail view page (first/last). */
const DETAIL_PAGE_SIZE = 50;

/**
 * Cached `sessionId -> absolute file path` map. Rebuilt only when
 * PROJECTS_DIR or any of its subdirectories change mtime. Without
 * this cache every parseSessions() re-walked the projects directory
 * (one readdir + N statSync) even when no session file had moved or
 * been added. With it, an unchanged tree resolves the index in two
 * stat calls (the projects dir itself plus a per-subdir confirmation).
 *
 * Invalidation is mtime-only: an empty/null cache means the next
 * call rebuilds. We do not invalidate by file content — a JSONL
 * line append doesn't add or remove a session file, so the index
 * stays correct.
 */
interface SessionFileIndexCache {
  projectsDirMtimeMs: number;
  subdirMtimes: Map<string, number>;
  index: Map<string, string>;
}
let sessionFileIndex: SessionFileIndexCache | null = null;

/**
 * Warning from the most recent parseSessions() call, or null if all entries
 * looked healthy. Used by the extension host to surface schema-drift errors
 * to the user instead of silently dropping every session.
 */
let lastParseWarning: string | null = null;

/** Threshold: only warn if at least this many entries were parsed. */
const SCHEMA_DRIFT_MIN_ENTRIES = 5;
/** Threshold: warn if fewer than this fraction of entries have required fields. */
const SCHEMA_DRIFT_MIN_VALID_RATIO = 0.2;

/**
 * Return the warning produced by the most recent parseSessions() call.
 * Null if the last parse looked healthy. Use this to surface a one-time error
 * banner when the Claude CLI changes its history schema.
 */
export function getLastParseWarning(): string | null {
  return lastParseWarning;
}

/**
 * Return the cached `sessionId -> absolute file path` map, rebuilding it
 * only when PROJECTS_DIR (or any of its subdirectories) has changed
 * mtime since the last build.
 *
 * Why subdir mtime matters: adding or removing a transcript file mutates
 * its parent project subdirectory's mtime — but does NOT touch
 * PROJECTS_DIR itself unless the project subdir is created/removed too.
 * Tracking subdirs catches the common case (new session inside an
 * existing project) without re-walking the whole tree on every call.
 */
function getSessionFileIndex(): Map<string, string> {
  let projectsStat: fs.Stats;
  try {
    projectsStat = fs.statSync(PROJECTS_DIR);
  } catch {
    // Projects directory missing — keep a stale cache (might be a
    // transient FS hiccup) and fall back to whatever we had. Returning
    // an empty map either way is fine because callers .get() and tolerate
    // null.
    return sessionFileIndex?.index ?? new Map();
  }

  if (sessionFileIndex && sessionFileIndex.projectsDirMtimeMs === projectsStat.mtimeMs) {
    // Top-level mtime unchanged — verify each subdir is also unchanged.
    let allFresh = true;
    for (const [sub, mtime] of sessionFileIndex.subdirMtimes) {
      let st: fs.Stats;
      try {
        st = fs.statSync(sub);
      } catch {
        allFresh = false;
        break;
      }
      if (st.mtimeMs !== mtime) {
        allFresh = false;
        break;
      }
    }
    if (allFresh) return sessionFileIndex.index;
  }

  const index = new Map<string, string>();
  const subdirMtimes = new Map<string, number>();
  let dirs: string[];
  try {
    dirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    sessionFileIndex = {
      projectsDirMtimeMs: projectsStat.mtimeMs,
      subdirMtimes,
      index,
    };
    return index;
  }

  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(dirPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    let files: string[];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      continue;
    }

    subdirMtimes.set(dirPath, stat.mtimeMs);
    for (const file of files) {
      if (file.endsWith(".jsonl")) {
        index.set(file.slice(0, -6), path.join(dirPath, file));
      }
    }
  }

  sessionFileIndex = {
    projectsDirMtimeMs: projectsStat.mtimeMs,
    subdirMtimes,
    index,
  };
  return index;
}

/**
 * Look up the JSONL file path for a session ID using the mtime-cached
 * directory index.
 */
export function getSessionFile(sessionId: string): string | null {
  return getSessionFileIndex().get(sessionId) ?? null;
}

/**
 * Extract the project folder name from an absolute project path.
 */
function extractProjectName(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

/**
 * Parse a JSONL file line-by-line, yielding typed objects via callback.
 * Skips malformed lines. Returns an empty array if the file cannot be read.
 *
 * Uses a streaming approach to avoid loading the entire file into a single
 * JS string. Reads in 64 KB chunks so only ~64 KB is resident at any time
 * (plus the accumulated results array).
 */
function parseJsonlFile<T>(filePath: string): T[] {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return [];
  }

  const results: T[] = [];
  const CHUNK = 64 * 1024;
  const buf = Buffer.alloc(CHUNK);
  let leftover = "";
  let bytesRead: number;

  try {
    do {
      bytesRead = fs.readSync(fd, buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      const chunk = leftover + buf.toString("utf-8", 0, bytesRead);
      const lines = chunk.split("\n");
      // Last element may be incomplete — carry it over
      leftover = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          results.push(JSON.parse(line) as T);
        } catch {
          // Skip malformed lines — expected during partial writes
        }
      }
    } while (bytesRead === CHUNK);

    // Process any remaining data
    if (leftover.trim()) {
      try {
        results.push(JSON.parse(leftover) as T);
      } catch {
        // Skip
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  return results;
}

/**
 * Determine which date group label a timestamp belongs to.
 */
function getDateGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  if (date >= monthAgo) return "This Month";
  return "Older";
}

/** Size of the tail window we read to capture the most recent gitBranch. */
const TAIL_READ_BYTES = 64 * 1024;

interface SessionMeta {
  branch: string;
  entrypoint: string;
  rename: string;
  summary: string;
  /** Latest CLI-generated topic title (`{type:"ai-title"}`). Higher quality than `summary`. */
  aiTitle: string;
}

/**
 * Module-scoped mtime cache for session metadata. parseSessions() runs
 * once per file-watcher tick (multiple per minute during active
 * sessions). Without caching, every tick re-read 256KB+64KB per session
 * even when only one transcript had changed. With it, an unchanged
 * session resolves in one stat call.
 */
const sessionMetaCache = createMtimeCache<SessionMeta>();

/**
 * Read both the head (first ~256KB) and tail (last ~64KB) of a session file
 * to extract metadata:
 * - branch (latest gitBranch — reflects current branch even after switches)
 * - entrypoint (from early lines — never changes)
 * - rename (most recent /rename command)
 * - summary (most recent auto-generated summary)
 *
 * We need the tail because long-running sessions may have switched branches
 * mid-session, and the starting branch is misleading. The head captures
 * entrypoint and early summaries; the tail captures the latest branch.
 *
 * Results are mtime-cached. Same path with the same (mtime, size) returns
 * the previously parsed meta object without touching the file again.
 */
function readSessionMeta(filePath: string): SessionMeta {
  return sessionMetaCache.get(filePath, computeSessionMeta);
}

/**
 * Invalidate the cached meta for a single session file. Used by the
 * targeted file-watcher path so a single transcript change does not
 * stale the rest of the cache.
 */
export function invalidateSessionMetaCache(filePath: string): void {
  sessionMetaCache.invalidate(filePath);
}

function computeSessionMeta(filePath: string): SessionMeta {
  const result = { branch: "", entrypoint: "", rename: "", summary: "", aiTitle: "" };
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return result;
  }

  try {
    const stat = fs.fstatSync(fd);
    const headSize = Math.max(SESSION_META_READ_BYTES, NAME_HINT_READ_BYTES);
    const headBytes = Math.min(headSize, stat.size);

    // Read head chunk
    const headBuf = Buffer.alloc(headBytes);
    fs.readSync(fd, headBuf, 0, headBytes, 0);
    const headChunk = headBuf.toString("utf-8");
    processMetaChunk(headChunk, result, /* isTail */ false);

    // If the file is bigger than the head read, also read a tail chunk
    // to capture the latest gitBranch. Avoid overlap with the head.
    if (stat.size > headBytes) {
      const tailBytes = Math.min(TAIL_READ_BYTES, stat.size - headBytes);
      const tailBuf = Buffer.alloc(tailBytes);
      const tailOffset = stat.size - tailBytes;
      fs.readSync(fd, tailBuf, 0, tailBytes, tailOffset);
      const tailChunk = tailBuf.toString("utf-8");
      processMetaChunk(tailChunk, result, /* isTail */ true);
    }
  } catch {
    // Read error — return whatever we have
  } finally {
    fs.closeSync(fd);
  }

  return result;
}

/**
 * Parse a chunk of JSONL and merge metadata into the running result.
 * When processing the tail, branch/summary overwrite; entrypoint never does.
 */
function processMetaChunk(
  chunk: string,
  result: SessionMeta,
  isTail: boolean,
): void {
  const hasRename = chunk.includes("/rename");
  const hasSummary = chunk.includes('"type":"summary"') || chunk.includes('"type": "summary"');
  const hasAiTitle = chunk.includes('"type":"ai-title"') || chunk.includes('"type": "ai-title"');

  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line) as Record<string, unknown>;

      // Branch — take the LATEST one seen. When processing the tail, every
      // branch overwrites the previous. When processing the head, we only
      // set it if unset (let tail override).
      if (typeof entry.gitBranch === "string") {
        if (isTail || !result.branch) {
          result.branch = entry.gitBranch;
        }
      }

      // Entrypoint only exists in early lines — never overwrite
      if (typeof entry.entrypoint === "string" && !result.entrypoint) {
        result.entrypoint = entry.entrypoint;
      }

      // Auto-summary — take the latest one seen
      if (hasSummary && entry.type === "summary" && typeof entry.summary === "string") {
        result.summary = (entry.summary as string).trim();
      }

      // CLI-generated topic title (`type:"ai-title"`) — latest wins.
      // Emitted by Claude CLI 2.1+ as the terminal/session title.
      if (hasAiTitle && entry.type === "ai-title" && typeof entry.aiTitle === "string") {
        result.aiTitle = (entry.aiTitle as string).trim();
      }

      // /rename command in user message — take the latest one seen
      if (hasRename && line.includes("/rename")) {
        const msg = (entry as { message?: { content?: unknown } }).message;
        if (msg?.content) {
          const text =
            typeof msg.content === "string"
              ? msg.content
              : Array.isArray(msg.content)
                ? (msg.content as Array<{ text?: string }>).map((b) => b.text ?? "").join("")
                : "";
          const match = text.match(/<command-name>\/rename<\/command-name>[\s\S]*?<command-args>([^<]+)<\/command-args>/);
          if (match?.[1]) {
            result.rename = match[1].trim();
          }
        }
      }
    } catch {
      // Partial JSON at chunk boundary — expected (first line of tail is usually partial)
    }
  }
}

/**
 * Probe whether a process id is still running. `process.kill(pid, 0)` is
 * the standard no-op liveness check — on Windows it works the same as on
 * POSIX, and a permission error (EPERM) still proves the process exists.
 */
function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Scan PID-named files in `~/.claude/sessions/` once and return:
 *   - `names`: sessionId -> user-set display name (subset that carry `name`)
 *   - `live`:  sessionId set whose recorded PID is still running
 *
 * Combined so both reads happen in a single directory walk. The CLI leaves
 * these files behind on hard exits, so the PID liveness check is what
 * distinguishes a session that's actually running from a stale shell.
 */
function readSessionsDir(): { names: Map<string, string>; live: Set<string> } {
  const names = new Map<string, string>();
  const live = new Set<string>();
  let files: string[];
  try {
    files = fs.readdirSync(SESSIONS_DIR);
  } catch {
    return { names, live };
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
      if (!sessionId) continue;
      if (typeof data.name === "string") names.set(sessionId, data.name);
      if (typeof data.pid === "number" && isPidAlive(data.pid)) {
        live.add(sessionId);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return { names, live };
}

/**
 * Parse all Claude Code sessions from the global history file.
 * Returns sessions sorted by most recent activity first.
 *
 * @param userRenames - Extension-managed session rename map (takes highest priority).
 */
export function parseSessions(userRenames: Record<string, string> = {}): Session[] {
  const { names: sessionNames, live: liveSessionIds } = readSessionsDir();
  const entries = parseJsonlFile<HistoryEntry>(HISTORY_FILE);

  // Group entries by sessionId
  const sessionMap = new Map<
    string,
    { entries: HistoryEntry[]; project: string; projectPath: string }
  >();

  // Track invalid count so we can detect schema drift. Without this, a CLI
  // upgrade that renames `sessionId` or `display` would silently drop every
  // session and the user would just see "No sessions yet" with no explanation.
  let invalidCount = 0;
  for (const entry of entries) {
    if (!entry.sessionId || !entry.display) {
      invalidCount++;
      continue;
    }

    const existing = sessionMap.get(entry.sessionId);
    if (existing) {
      existing.entries.push(entry);
    } else {
      sessionMap.set(entry.sessionId, {
        entries: [entry],
        project: extractProjectName(entry.project || ""),
        projectPath: entry.project || "",
      });
    }
  }

  if (
    entries.length >= SCHEMA_DRIFT_MIN_ENTRIES &&
    (entries.length - invalidCount) / entries.length < SCHEMA_DRIFT_MIN_VALID_RATIO
  ) {
    lastParseWarning =
      `Claude history schema may have changed: ${invalidCount} of ${entries.length} entries are missing required fields. ` +
      `If you recently updated the Claude CLI, the extension may need an update.`;
  } else {
    lastParseWarning = null;
  }

  // Build session objects.
  //
  // `projectPathByKey` remembers the first-seen absolute path for each
  // lowercased project name so Windows casing variants collapse into a
  // single dropdown entry. History-derived sessions populate it here;
  // orphan discovery (below) both reads from and extends it.
  const sessions: Session[] = [];
  const projectPathByKey = new Map<string, string>();
  for (const [sessionId, data] of sessionMap) {
    const timestamps = data.entries.map((e) => e.timestamp);
    const prompts = data.entries
      .map((e) => e.display)
      .filter((d): d is string => Boolean(d) && d !== "/login ");
    if (prompts.length === 0) continue;

    // Read branch + entrypoint + name hints in one bounded file read
    let branch = "";
    let entrypoint = "";
    const sessionFile = getSessionFile(sessionId);
    let fileRename = "";
    let fileSummary = "";
    let fileAiTitle = "";
    if (sessionFile) {
      const meta = readSessionMeta(sessionFile);
      branch = meta.branch;
      entrypoint = meta.entrypoint;
      fileRename = meta.rename;
      fileSummary = meta.summary;
      fileAiTitle = meta.aiTitle;
    }

    // Resolve session name with priority:
    // 1. Extension-managed rename (always wins)
    // 2. Live PID map (active sessions)
    // 3. /rename command in transcript
    // 4. CLI-generated `ai-title` (Claude 2.1+ terminal/session title)
    // 5. Claude's older auto-generated `summary` (fallback for pre-2.1 sessions)
    let name = userRenames[sessionId] ?? "";
    if (!name) name = sessionNames.get(sessionId) ?? "";
    if (!name) name = fileRename || fileAiTitle || fileSummary;

    const summary =
      prompts[0].length > 100 ? prompts[0].slice(0, 100) + "..." : prompts[0];

    // Pre-compute lowercased lookup keys so the webview filter does not
    // allocate strings on every keystroke. searchHaystack joins fields with
    // "\n" so that user input cannot accidentally match across boundaries.
    const projectKey = data.project.toLowerCase();
    const searchHaystack = `${name}\n${data.project}\n${branch}\n${summary}`.toLowerCase();

    // Canonicalize projectPath casing: same project typed with
    // different casings collapses into one entry. First sighting wins.
    const canonicalPath =
      projectPathByKey.get(projectKey) ?? data.projectPath;
    if (!projectPathByKey.has(projectKey)) {
      projectPathByKey.set(projectKey, data.projectPath);
    }

    sessions.push({
      id: sessionId,
      name,
      project: data.project,
      projectPath: canonicalPath,
      branch,
      entrypoint,
      startTime: Math.min(...timestamps),
      endTime: Math.max(...timestamps),
      messageCount: prompts.length,
      summary,
      prompts,
      projectKey,
      searchHaystack,
      isLive: liveSessionIds.has(sessionId),
    });
  }

  // Sessions started inside the official Claude Code VS Code extension
  // do NOT add entries to ~/.claude/history.jsonl — the CLI owns that
  // file, not the extension. Without this pass, every extension-
  // originated session would be invisible in Claude Manager even
  // though the transcript sits on disk under projects/.
  //
  // We scan the projects directory for any sessionId that did not come
  // through history.jsonl and reconstruct a Session object by reading
  // the transcript header for the first user prompt, cwd, and
  // timestamp span.
  const knownIds = new Set(sessionMap.keys());
  const orphans = discoverOrphanSessions(
    knownIds,
    userRenames,
    sessionNames,
    projectPathByKey,
    liveSessionIds,
  );
  sessions.push(...orphans);

  sessions.sort((a, b) => b.endTime - a.endTime);
  return sessions;
}

/**
 * Shape returned by `readOrphanSessionData` — null when the file has no
 * usable content.
 *
 * `branch`, `entrypoint`, `rename`, `summary` are captured during the
 * single streaming pass so `discoverOrphanSessions` doesn't have to
 * call `readSessionMeta` afterwards (which would trigger a second
 * 320KB read on top of the full-file stream we already did). Latest-
 * wins for branch + summary mirrors the head/tail rules in
 * `processMetaChunk`. Entrypoint = first observed.
 */
interface OrphanData {
  cwd: string;
  firstPrompt: string;
  messageCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  branch: string;
  entrypoint: string;
  rename: string;
  summary: string;
  aiTitle: string;
}

/**
 * Cache of `readOrphanSessionData` results keyed on file path, valid
 * while the underlying file's mtime hasn't changed. Transcript files
 * can be 50 MB+ each and parseSessions reruns on every file-watcher
 * tick — without this cache, a watcher-triggered refresh on one
 * session would re-stream every other orphan file in the projects
 * directory. With it, a refresh costs one stat per unchanged orphan.
 *
 * Negative cache entries (data === null) are kept too so empty /
 * queue-only shells don't get re-read each tick.
 */
const orphanCache = new Map<string, { mtimeMs: number; data: OrphanData | null }>();

/** Drop the orphan-cache entry for a single transcript so the next read re-streams it. */
function invalidateOrphanCacheEntry(filePath: string): void {
  orphanCache.delete(filePath);
}

/**
 * Extract the bits of metadata we need to synthesize a Session object
 * from a transcript .jsonl that has no history.jsonl entries.
 *
 * Streams the file in bounded chunks, stopping early once we have a
 * first user prompt + cwd. We still need to reach the tail to get the
 * last timestamp — but we only keep the *latest* timestamp seen rather
 * than collecting every entry, so memory stays flat regardless of
 * transcript length.
 */
function readOrphanSessionData(filePath: string): OrphanData | null {
  // Mtime cache: avoid re-streaming unchanged transcripts on every
  // parseSessions. A missing stat bails to the uncached read path.
  try {
    const st = fs.statSync(filePath);
    const cached = orphanCache.get(filePath);
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.data;
    const fresh = readOrphanSessionDataUncached(filePath);
    orphanCache.set(filePath, { mtimeMs: st.mtimeMs, data: fresh });
    return fresh;
  } catch {
    return readOrphanSessionDataUncached(filePath);
  }
}

function readOrphanSessionDataUncached(filePath: string): OrphanData | null {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return null;
  }

  let cwd = "";
  let firstPrompt = "";
  let messageCount = 0;
  let firstTimestamp = 0;
  let lastTimestamp = 0;
  let branch = "";
  let entrypoint = "";
  let rename = "";
  let summary = "";
  let aiTitle = "";
  const CHUNK = 64 * 1024;
  const buf = Buffer.alloc(CHUNK);
  let leftover = "";
  let bytesRead: number;

  const captureRename = (line: string, message: { content?: unknown } | undefined): void => {
    if (!line.includes("/rename")) return;
    if (!message?.content) return;
    const text =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? (message.content as Array<{ text?: string }>)
              .map((b) => b.text ?? "")
              .join("")
          : "";
    const match = text.match(
      /<command-name>\/rename<\/command-name>[\s\S]*?<command-args>([^<]+)<\/command-args>/,
    );
    if (match?.[1]) rename = match[1].trim();
  };

  try {
    do {
      bytesRead = fs.readSync(fd, buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      const chunk = leftover + buf.toString("utf-8", 0, bytesRead);
      const lines = chunk.split("\n");
      leftover = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let entry: SessionEntry;
        try {
          entry = JSON.parse(line) as SessionEntry;
        } catch {
          continue;
        }
        if (!cwd && typeof entry.cwd === "string") cwd = entry.cwd;
        if (typeof entry.timestamp === "string") {
          const ts = Date.parse(entry.timestamp);
          if (!Number.isNaN(ts)) {
            if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
            if (ts > lastTimestamp) lastTimestamp = ts;
          }
        }
        // Meta capture mirrors readSessionMeta: branch + summary follow
        // latest-wins, entrypoint takes the first observed value.
        const e = entry as unknown as Record<string, unknown>;
        if (typeof e.gitBranch === "string") branch = e.gitBranch;
        if (typeof e.entrypoint === "string" && !entrypoint) entrypoint = e.entrypoint;
        if (e.type === "summary" && typeof e.summary === "string") {
          summary = (e.summary as string).trim();
        }
        if (e.type === "ai-title" && typeof e.aiTitle === "string") {
          aiTitle = (e.aiTitle as string).trim();
        }
        captureRename(line, entry.message);
        if (entry.message?.role === "user" && !entry.isSidechain) {
          messageCount++;
          if (!firstPrompt) {
            const content = entry.message.content;
            if (typeof content === "string") {
              firstPrompt = content;
            } else if (Array.isArray(content)) {
              const text = content
                .map((b) => (typeof b.text === "string" ? b.text : ""))
                .filter(Boolean)
                .join(" ");
              if (text) firstPrompt = text;
            }
          }
        }
      }
    } while (bytesRead === CHUNK);

    if (leftover.trim()) {
      try {
        const entry = JSON.parse(leftover) as SessionEntry;
        if (typeof entry.timestamp === "string") {
          const ts = Date.parse(entry.timestamp);
          if (!Number.isNaN(ts) && ts > lastTimestamp) lastTimestamp = ts;
        }
      } catch {
        // ignore — partial JSON at EOF is normal
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  // A file with no user messages isn't a real session — skip it so
  // empty shells (queue-operation-only files) don't clutter the list.
  if (!firstPrompt || messageCount === 0) return null;

  return {
    cwd,
    firstPrompt,
    messageCount,
    firstTimestamp,
    lastTimestamp,
    branch,
    entrypoint,
    rename,
    summary,
    aiTitle,
  };
}

/**
 * Walk ~/.claude/projects/ and build Session objects for any transcript
 * file whose sessionId isn't already in the history-derived map. Skips
 * directories we can't read (permissions, dangling symlinks) instead
 * of failing the whole parse.
 *
 * Takes `projectPathByKey` so it can align path casing with whatever
 * history.jsonl already used. Without this, Windows users who see both
 * `C--Users-foo` and `c--Users-foo` slugs for the same project would
 * get duplicated entries in the project dropdown — one per casing.
 */
function discoverOrphanSessions(
  knownIds: Set<string>,
  userRenames: Record<string, string>,
  sessionNames: Map<string, string>,
  projectPathByKey: Map<string, string>,
  liveSessionIds: Set<string>,
): Session[] {
  const out: Session[] = [];
  let projectSlugs: string[];
  try {
    projectSlugs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return out;
  }

  for (const slug of projectSlugs) {
    const dirPath = path.join(PROJECTS_DIR, slug);
    let files: string[];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const sessionId = file.slice(0, -".jsonl".length);
      if (knownIds.has(sessionId)) continue;

      const filePath = path.join(dirPath, file);
      const data = readOrphanSessionData(filePath);
      if (!data) continue;

      // Meta is captured during the streaming pass above so we don't
      // re-read 320KB per orphan via readSessionMeta.
      // Resolve projectPath with a three-tier fallback:
      //   1. cwd recorded in the JSONL — exact + authoritative
      //   2. slug-decoded (best-effort; lossy around embedded dashes)
      //   3. raw slug (so the UI shows *something* instead of blank)
      // Without this fallback, orphan sessions that never recorded a
      // cwd would have empty projectPath and Resume couldn't launch.
      const rawProjectPath = data.cwd || deslugifyProjectPath(slug) || slug;
      const project = extractProjectName(rawProjectPath);
      const projectKey = project.toLowerCase();

      // Windows path-casing dedupe: if history already saw this
      // project under a different casing (e.g. `C:\Users\foo` vs
      // `c:\Users\foo`), reuse the established path so both casings
      // collapse into one dropdown entry. Only applies when the
      // project name lowercases identically — real distinct projects
      // with different names aren't touched.
      const canonicalPath = projectPathByKey.get(projectKey) ?? rawProjectPath;
      if (!projectPathByKey.has(projectKey)) {
        projectPathByKey.set(projectKey, rawProjectPath);
      }

      // Name resolution mirrors the history path: extension rename >
      // active-session PID map > /rename in transcript > ai-title (CLI 2.1+) >
      // older auto-summary fallback.
      let name = userRenames[sessionId] ?? "";
      if (!name) name = sessionNames.get(sessionId) ?? "";
      if (!name) name = data.rename || data.aiTitle || data.summary;

      const summary =
        data.firstPrompt.length > 100
          ? data.firstPrompt.slice(0, 100) + "..."
          : data.firstPrompt;

      const searchHaystack =
        `${name}\n${project}\n${data.branch}\n${summary}`.toLowerCase();

      out.push({
        id: sessionId,
        name,
        project,
        projectPath: canonicalPath,
        branch: data.branch,
        entrypoint: data.entrypoint,
        startTime: data.firstTimestamp || data.lastTimestamp,
        endTime: data.lastTimestamp || data.firstTimestamp,
        messageCount: data.messageCount,
        summary,
        prompts: [data.firstPrompt],
        projectKey,
        searchHaystack,
        isLive: liveSessionIds.has(sessionId),
      });
    }
  }

  return out;
}

/**
 * Parse a page of messages from a session transcript.
 *
 * @param mode - "last" returns the most recent N messages (default, so
 *   continued sessions show the latest conversation). "first" returns the
 *   earliest N messages (the session's opening). N = DETAIL_PAGE_SIZE (20).
 *
 * The caller gets `totalMessages` to decide whether to show a toggle, and
 * `mode` echoed back so the webview knows which view is active.
 *
 * Returns null if the session cannot be found.
 */
export function parseSessionDetail(
  sessionId: string,
  cachedSession?: Session,
  mode: "first" | "last" = "last",
  query?: string,
): SessionDetail | null {
  const session =
    cachedSession ?? parseSessions().find((s) => s.id === sessionId);
  if (!session) return null;

  const sessionFile = getSessionFile(sessionId);
  if (!sessionFile) {
    return { ...session, messages: [], detailMode: mode, totalMessages: 0 };
  }

  // Normalise query once up front. Empty / whitespace-only strings
  // count as "no query" so the webview can clear its filter without
  // triggering a second request shape.
  const q = query?.trim().toLowerCase() ?? "";

  const entries = parseJsonlFile<SessionEntry>(sessionFile);
  const allMessages: Message[] = [];

  for (const entry of entries) {
    if (!entry.message?.role) continue;
    if (entry.type === "file-history-snapshot") continue;
    if (entry.isSidechain) continue;

    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;

    // Walk the content blocks once, splitting into four buckets:
    //   text    → user-visible prose (keeps ordering)
    //   thinking→ extended-thinking prose (concatenated separately)
    //   toolUses→ one row per tool_use for rendering
    //   tool_result blocks flatten into text so users see command
    //   output inline — same-shape as plain text for detail view
    const textParts: string[] = [];
    let thinkingText = "";
    const toolUses: ToolUseBlock[] = [];

    if (typeof entry.message.content === "string") {
      textParts.push(entry.message.content);
    } else if (Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) {
        const t = block.type;
        if (t === "text" && typeof block.text === "string") {
          textParts.push(block.text);
        } else if (t === "thinking" && typeof block.thinking === "string") {
          thinkingText += (thinkingText ? "\n\n" : "") + block.thinking;
        } else if (t === "tool_use" && typeof block.name === "string") {
          toolUses.push({
            name: block.name,
            arg: summariseToolInput(block.name, block.input),
          });
        } else if (t === "tool_result") {
          // Flatten tool_result so command output appears in-line
          // under the assistant/user turn that ran the tool. Result
          // `content` is either string or an array of text blocks.
          const c = (block as { content?: unknown }).content;
          if (typeof c === "string") {
            textParts.push(c);
          } else if (Array.isArray(c)) {
            for (const inner of c) {
              const innerText = (inner as { text?: unknown }).text;
              if (typeof innerText === "string") textParts.push(innerText);
            }
          }
        }
      }
    }

    const content = textParts.join("\n").trim();

    // Keep assistant messages that have no text but do have tool calls
    // — users still want to see "Claude ran Bash: git status" even
    // when the turn was just tool calls. Drop completely empty turns.
    const hasUsable =
      content.length > 0 || toolUses.length > 0 || thinkingText.length > 0;
    if (!hasUsable) continue;

    const msg: Message = {
      role: role as "user" | "assistant",
      content,
      timestamp: entry.timestamp ?? "",
    };
    if (toolUses.length > 0) msg.toolUses = toolUses;
    if (thinkingText) msg.thinking = thinkingText;
    if (role === "assistant") {
      const u = entry.message.usage;
      if (u) {
        msg.usage = {
          input: typeof u.input_tokens === "number" ? u.input_tokens : 0,
          output: typeof u.output_tokens === "number" ? u.output_tokens : 0,
          cacheRead:
            typeof u.cache_read_input_tokens === "number"
              ? u.cache_read_input_tokens
              : 0,
          cacheCreation:
            typeof u.cache_creation_input_tokens === "number"
              ? u.cache_creation_input_tokens
              : 0,
        };
      }
      if (typeof entry.message.model === "string") {
        msg.model = entry.message.model;
      }
    }
    allMessages.push(msg);
  }

  const total = allMessages.length;

  // Session-wide token + tool totals summed across every message so
  // the detail view can show a "spent X on this session" line
  // without the caller recomputing from a paged message list.
  let totalToolUses = 0;
  let hasUsage = false;
  const totalUsage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
  };
  for (const m of allMessages) {
    if (m.toolUses) totalToolUses += m.toolUses.length;
    if (m.usage) {
      hasUsage = true;
      totalUsage.input += m.usage.input;
      totalUsage.output += m.usage.output;
      totalUsage.cacheRead += m.usage.cacheRead;
      totalUsage.cacheCreation += m.usage.cacheCreation;
    }
  }

  // Query-mode: filter across the full transcript and return every
  // match. We intentionally skip paging here — search exists
  // specifically to let users find things beyond the 50-msg window,
  // so truncating hits would defeat the feature. On long sessions
  // (10k+ msgs) the match set stays small in practice because
  // queries are specific enough.
  //
  // Matching fields: content, thinking, tool name + arg. Case-
  // insensitive substring (haystack pre-lowered at compare time to
  // avoid allocating lowercased copies of entire transcripts when
  // most messages won't match).
  if (q) {
    const matches: Message[] = [];
    for (const m of allMessages) {
      const haystack = [
        m.content,
        m.thinking ?? "",
        ...(m.toolUses ?? []).map((t) => `${t.name} ${t.arg}`),
      ]
        .join("\n")
        .toLowerCase();
      if (haystack.includes(q)) matches.push(m);
    }
    return {
      ...session,
      messages: matches,
      messageCount: matches.length,
      totalMessages: total,
      detailMode: mode,
      detailQuery: q,
      totalMatches: matches.length,
      totalToolUses,
      ...(hasUsage ? { totalUsage } : {}),
    };
  }

  // Default paged view (no query).
  const page = mode === "first"
    ? allMessages.slice(0, DETAIL_PAGE_SIZE)
    : allMessages.slice(-DETAIL_PAGE_SIZE);

  return {
    ...session,
    messages: page,
    messageCount: page.length,
    totalMessages: total,
    detailMode: mode,
    totalToolUses,
    ...(hasUsage ? { totalUsage } : {}),
  };
}

/**
 * Group sessions by date label (Today, Yesterday, This Week, This Month, Older).
 * Groups are returned in chronological order; only non-empty groups are included.
 */
export function groupSessions(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, Session[]>();
  const order = ["Today", "Yesterday", "This Week", "This Month", "Older"];

  for (const session of sessions) {
    const label = getDateGroup(session.endTime);
    const group = groups.get(label) ?? [];
    group.push(session);
    groups.set(label, group);
  }

  return order
    .filter((label) => groups.has(label))
    .map((label) => ({
      label,
      sessions: groups.get(label)!,
    }));
}

/**
 * Re-parse a single session by id, returning a fresh Session object or
 * null when the session no longer exists.
 *
 * Used by the targeted file-watcher path so a single transcript change
 * doesn't trigger a full corpus re-read. Only the named session's
 * mtime cache entry is invalidated; siblings keep their cached meta.
 *
 * For history-derived sessions we re-read history.jsonl to rebuild the
 * prompt list (a transcript append corresponds to a new history entry
 * for active sessions). Orphan sessions don't have history entries and
 * are reconstructed entirely from the transcript stream.
 */
export function reparseOneSession(
  sessionId: string,
  userRenames: Record<string, string> = {},
): Session | null {
  const filePath = getSessionFile(sessionId);
  if (!filePath) return null;

  // Drop the stale cache entry so the next readSessionMeta picks up the
  // new mtime. Without this the cached meta from before the change wins.
  invalidateSessionMetaCache(filePath);
  invalidateOrphanCacheEntry(filePath);

  // Cheapest path that produces a correct Session: re-run parseSessions
  // and pluck the matching id. parseSessions itself is now mtime-cached
  // for meta reads (via sessionMetaCache) and for the file index, so the
  // cost of a watcher-triggered rebuild is dominated by history.jsonl
  // (small, line-streamed) plus one transcript meta read for the changed
  // session. Sibling meta reads are served from cache.
  const sessions = parseSessions(userRenames);
  return sessions.find((s) => s.id === sessionId) ?? null;
}

/**
 * Compute aggregate statistics for a set of sessions.
 */
export function getStats(sessions: Session[]): Stats {
  const projects = new Set<string>();
  const weekAgo = Date.now() - 7 * 86400000;
  let thisWeek = 0;
  let totalMessages = 0;

  for (const s of sessions) {
    projects.add(s.project);
    if (s.endTime >= weekAgo) thisWeek++;
    totalMessages += s.messageCount;
  }

  return {
    totalSessions: sessions.length,
    totalProjects: projects.size,
    thisWeek,
    totalMessages,
  };
}

/**
 * Get a sorted list of unique project names across all sessions.
 */
export function getUniqueProjects(sessions: Session[]): string[] {
  return [...new Set(sessions.map((s) => s.project))].sort();
}

/**
 * Filter sessions by a text query. Case-insensitive.
 *
 * Fast path uses the pre-computed `searchHaystack` field — one `includes()`
 * per session instead of four `.toLowerCase().includes()` calls. Falls back
 * to scanning individual prompts only if the haystack misses, keeping the
 * common case allocation-free while still finding deep matches.
 */
export function searchSessions(sessions: Session[], query: string): Session[] {
  const lower = query.toLowerCase();
  return sessions.filter((s) => {
    if (s.searchHaystack.includes(lower)) return true;
    // Slow path — scan prompts. Prompts are not in the haystack because
    // they can be huge (50KB+) and would bloat every session payload.
    return s.prompts.some((p) => p.toLowerCase().includes(lower));
  });
}

/**
 * Filter sessions by project name, branch, and/or date range.
 * All filters are optional; only provided filters are applied.
 */
export function filterSessions(
  sessions: Session[],
  filters: {
    project?: string;
    branch?: string;
    dateRange?: [number, number];
  },
): Session[] {
  let result = sessions;
  if (filters.project) {
    result = result.filter((s) => s.project === filters.project);
  }
  if (filters.branch) {
    result = result.filter((s) => s.branch === filters.branch);
  }
  if (filters.dateRange) {
    const [from, to] = filters.dateRange;
    result = result.filter((s) => s.endTime >= from && s.endTime <= to);
  }
  return result;
}
