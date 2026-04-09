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

/**
 * Read the first few KB of a session file to extract metadata:
 * - branch (gitBranch field)
 * - entrypoint (entrypoint field)
 * - rename (last /rename command found)
 * - summary (last auto-generated summary found)
 *
 * Combines what was previously two separate file reads (readSessionMeta +
 * extractSessionNameHints) into one bounded read to avoid opening the same
 * file twice.
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
    // Read a bounded chunk — enough for metadata + most renames/summaries
    const readSize = Math.max(SESSION_META_READ_BYTES, NAME_HINT_READ_BYTES);
    const stat = fs.fstatSync(fd);
    const actualRead = Math.min(readSize, stat.size);
    const buffer = Buffer.alloc(actualRead);
    fs.readSync(fd, buffer, 0, actualRead, 0);
    const chunk = buffer.toString("utf-8");

    // Quick checks to avoid unnecessary parsing
    const hasRename = chunk.includes("/rename");
    const hasSummary = chunk.includes('"type":"summary"') || chunk.includes('"type": "summary"');

    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as Record<string, unknown>;

        // Branch + entrypoint (early lines)
        if (typeof entry.gitBranch === "string" && !result.branch) {
          result.branch = entry.gitBranch;
        }
        if (typeof entry.entrypoint === "string" && !result.entrypoint) {
          result.entrypoint = entry.entrypoint;
        }

        // Auto-summary
        if (hasSummary && entry.type === "summary" && typeof entry.summary === "string") {
          result.summary = (entry.summary as string).trim();
        }

        // /rename command in user message
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
        // Partial JSON at chunk boundary — expected
      }
    }
  } catch {
    // Read error — return whatever we have
  } finally {
    fs.closeSync(fd);
  }

  return result;
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

  for (const entry of entries) {
    if (!entry.sessionId || !entry.display) continue;

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
 * Checks name, project, branch, and summary first (cheap). Falls back to
 * scanning individual prompts only if the fast fields don't match — this
 * keeps the common case fast while still finding deep matches.
 */
export function searchSessions(sessions: Session[], query: string): Session[] {
  const lower = query.toLowerCase();
  return sessions.filter((s) => {
    // Fast path — check short fields first
    if (
      s.name.toLowerCase().includes(lower) ||
      s.project.toLowerCase().includes(lower) ||
      s.branch.toLowerCase().includes(lower) ||
      s.summary.toLowerCase().includes(lower)
    ) {
      return true;
    }
    // Slow path — scan prompts (skips if fast path matched)
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
