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
import type {
  HistoryEntry,
  Session,
  SessionDetail,
  SessionEntry,
  SessionGroup,
  Message,
  Stats,
} from "./types";

/** Maximum bytes to read from a session file when extracting name hints (rename/summary). */
const NAME_HINT_READ_BYTES = 256 * 1024; // 256 KB — covers most sessions

/** Maximum messages returned in a session detail payload. */
const MAX_DETAIL_MESSAGES = 200;

/** Pre-built index: sessionId -> absolute file path. Reset on each parseSessions() call. */
let sessionFileIndex: Map<string, string> | null = null;

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
 * Scan the projects directory and build an index mapping session IDs to their JSONL file paths.
 * Returns an empty map if the projects directory does not exist.
 */
function buildSessionFileIndex(): Map<string, string> {
  const index = new Map<string, string>();
  try {
    const dirs = fs.readdirSync(PROJECTS_DIR);
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

      for (const file of files) {
        if (file.endsWith(".jsonl")) {
          index.set(file.slice(0, -6), path.join(dirPath, file));
        }
      }
    }
  } catch {
    // ENOENT is expected if projects dir doesn't exist yet
  }
  return index;
}

/**
 * Look up the JSONL file path for a session ID, building the index on first call.
 */
function getSessionFile(sessionId: string): string | null {
  if (!sessionFileIndex) {
    sessionFileIndex = buildSessionFileIndex();
  }
  return sessionFileIndex.get(sessionId) ?? null;
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
 */
function readSessionMeta(filePath: string): {
  branch: string;
  entrypoint: string;
  rename: string;
  summary: string;
} {
  const result = { branch: "", entrypoint: "", rename: "", summary: "" };
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
  result: { branch: string; entrypoint: string; rename: string; summary: string },
  isTail: boolean,
): void {
  const hasRename = chunk.includes("/rename");
  const hasSummary = chunk.includes('"type":"summary"') || chunk.includes('"type": "summary"');

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
 * Build a map of sessionId -> user-assigned session name from the sessions directory.
 * Reads PID-named files in ~/.claude/sessions/ which store active session metadata.
 */
function buildSessionNameMap(): Map<string, string> {
  const nameMap = new Map<string, string>();
  let files: string[];
  try {
    files = fs.readdirSync(SESSIONS_DIR);
  } catch {
    return nameMap;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (typeof data.sessionId === "string" && typeof data.name === "string") {
        nameMap.set(data.sessionId, data.name);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return nameMap;
}

/**
 * Parse all Claude Code sessions from the global history file.
 * Returns sessions sorted by most recent activity first.
 *
 * @param userRenames - Extension-managed session rename map (takes highest priority).
 */
export function parseSessions(userRenames: Record<string, string> = {}): Session[] {
  // Reset file index for fresh scan
  sessionFileIndex = null;

  const sessionNames = buildSessionNameMap();
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

  // Build session objects
  const sessions: Session[] = [];
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
    if (sessionFile) {
      const meta = readSessionMeta(sessionFile);
      branch = meta.branch;
      entrypoint = meta.entrypoint;
      fileRename = meta.rename;
      fileSummary = meta.summary;
    }

    // Resolve session name with priority:
    // 1. Extension-managed rename (always wins)
    // 2. Live PID map (active sessions)
    // 3. /rename command in transcript
    // 4. Claude's auto-generated summary
    let name = userRenames[sessionId] ?? "";
    if (!name) name = sessionNames.get(sessionId) ?? "";
    if (!name) name = fileRename || fileSummary;

    const summary =
      prompts[0].length > 100 ? prompts[0].slice(0, 100) + "..." : prompts[0];

    // Pre-compute lowercased lookup keys so the webview filter does not
    // allocate strings on every keystroke. searchHaystack joins fields with
    // "\n" so that user input cannot accidentally match across boundaries.
    const projectKey = data.project.toLowerCase();
    const searchHaystack = `${name}\n${data.project}\n${branch}\n${summary}`.toLowerCase();

    sessions.push({
      id: sessionId,
      name,
      project: data.project,
      projectPath: data.projectPath,
      branch,
      entrypoint,
      startTime: Math.min(...timestamps),
      endTime: Math.max(...timestamps),
      messageCount: prompts.length,
      summary,
      prompts,
      projectKey,
      searchHaystack,
    });
  }

  sessions.sort((a, b) => b.endTime - a.endTime);
  return sessions;
}

/**
 * Parse the full message transcript for a single session.
 * Uses the cached session object if provided, otherwise looks it up.
 *
 * Messages are capped at MAX_DETAIL_MESSAGES to avoid sending huge payloads
 * to the webview. The `hasMore` flag indicates if messages were truncated.
 *
 * Returns null if the session cannot be found.
 */
export function parseSessionDetail(
  sessionId: string,
  cachedSession?: Session,
): SessionDetail | null {
  const session =
    cachedSession ?? parseSessions().find((s) => s.id === sessionId);
  if (!session) return null;

  const sessionFile = getSessionFile(sessionId);
  if (!sessionFile) {
    return { ...session, messages: [] };
  }

  const entries = parseJsonlFile<SessionEntry>(sessionFile);
  const messages: Message[] = [];

  for (const entry of entries) {
    if (!entry.message?.role) continue;
    if (entry.type === "file-history-snapshot") continue;
    if (entry.isSidechain) continue;

    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;

    let content = "";
    if (typeof entry.message.content === "string") {
      content = entry.message.content;
    } else if (Array.isArray(entry.message.content)) {
      content = entry.message.content
        .map((block) => block.text ?? "")
        .filter(Boolean)
        .join("\n");
    }

    if (!content.trim()) continue;

    messages.push({
      role: role as "user" | "assistant",
      content,
      timestamp: entry.timestamp ?? "",
    });

    if (messages.length >= MAX_DETAIL_MESSAGES) break;
  }

  return {
    ...session,
    messages,
    messageCount: messages.length,
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
