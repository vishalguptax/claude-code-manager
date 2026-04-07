/**
 * Session parsing — reads Claude CLI data files and builds session objects.
 * Pure Node.js file I/O, no VS Code dependency.
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
      } catch (err: unknown) {
        console.warn(`[claude-manager] Failed to stat ${dirPath}:`, (err as Error).message);
        continue;
      }
      if (!stat.isDirectory()) {
        continue;
      }

      let files: string[];
      try {
        files = fs.readdirSync(dirPath);
      } catch (err: unknown) {
        console.warn(`[claude-manager] Failed to read directory ${dirPath}:`, (err as Error).message);
        continue;
      }

      for (const file of files) {
        if (file.endsWith(".jsonl")) {
          const sessionId = file.replace(".jsonl", "");
          index.set(sessionId, path.join(dirPath, file));
        }
      }
    }
  } catch (err: unknown) {
    // ENOENT is expected if projects dir doesn't exist yet
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to scan projects directory:`, (err as Error).message);
    }
  }
  return index;
}

/**
 * Look up the JSONL file path for a session ID, building the index on first call.
 * Returns null if no file is found for the given session.
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
 * Parse a JSONL file into an array of typed objects.
 * Skips malformed lines with a warning. Returns an empty array if the file cannot be read.
 */
function parseJsonlFile<T>(filePath: string): T[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to read ${filePath}:`, (err as Error).message);
    }
    return [];
  }

  const lines = content.split("\n").filter((line) => line.trim());
  const results: T[] = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line) as T);
    } catch {
      // Skip malformed lines -- these are expected in partial writes
    }
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
 * Read the first few KB of a session file to extract branch and entrypoint metadata.
 * This avoids reading potentially large session files in full.
 */
function readSessionMeta(filePath: string): { branch: string; entrypoint: string } {
  const result = { branch: "", entrypoint: "" };
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch (err: unknown) {
    console.warn(`[claude-manager] Failed to open ${filePath}:`, (err as Error).message);
    return result;
  }

  try {
    const buffer = Buffer.alloc(SESSION_META_READ_BYTES);
    fs.readSync(fd, buffer, 0, SESSION_META_READ_BYTES, 0);
    const chunk = buffer.toString("utf-8");
    const lines = chunk.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (typeof entry.gitBranch === "string" && !result.branch) {
          result.branch = entry.gitBranch;
        }
        if (typeof entry.entrypoint === "string" && !result.entrypoint) {
          result.entrypoint = entry.entrypoint;
        }
        if (result.branch && result.entrypoint) break;
      } catch {
        // Partial JSON line at the end of the buffer -- expected
      }
    }
  } catch (err: unknown) {
    console.warn(`[claude-manager] Failed to read metadata from ${filePath}:`, (err as Error).message);
  } finally {
    fs.closeSync(fd);
  }

  return result;
}

/**
 * Build a map of sessionId -> user-assigned session name from the sessions directory.
 */
function buildSessionNameMap(): Map<string, string> {
  const nameMap = new Map<string, string>();
  let files: string[];
  try {
    files = fs.readdirSync(SESSIONS_DIR);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to read sessions directory:`, (err as Error).message);
    }
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
    } catch (err: unknown) {
      console.warn(`[claude-manager] Failed to parse session file ${file}:`, (err as Error).message);
    }
  }

  return nameMap;
}

/**
 * Parse all Claude Code sessions from the global history file.
 * Returns sessions sorted by most recent activity first.
 *
 * This resets the internal file index so fresh data is always returned.
 */
export function parseSessions(): Session[] {
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

    // Read branch + entrypoint from session file (fast: file index + 4KB read)
    let branch = "";
    let entrypoint = "";
    const sessionFile = getSessionFile(sessionId);
    if (sessionFile) {
      const meta = readSessionMeta(sessionFile);
      branch = meta.branch;
      entrypoint = meta.entrypoint;
    }

    const summary =
      prompts[0].length > 100 ? prompts[0].slice(0, 100) + "..." : prompts[0];

    sessions.push({
      id: sessionId,
      name: sessionNames.get(sessionId) ?? "",
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
  const projects = new Set(sessions.map((s) => s.project));
  const weekAgo = Date.now() - 7 * 86400000;
  const thisWeek = sessions.filter((s) => s.endTime >= weekAgo).length;
  const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);

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
 * Filter sessions by a text query, matching against project, branch, summary, and prompts.
 * The search is case-insensitive.
 */
export function searchSessions(sessions: Session[], query: string): Session[] {
  const lower = query.toLowerCase();
  return sessions.filter(
    (s) =>
      s.project.toLowerCase().includes(lower) ||
      s.branch.toLowerCase().includes(lower) ||
      s.summary.toLowerCase().includes(lower) ||
      s.prompts.some((p) => p.toLowerCase().includes(lower)),
  );
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
