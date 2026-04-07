import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  HistoryEntry,
  Session,
  SessionDetail,
  SessionEntry,
  SessionGroup,
  Message,
  Stats,
} from "./types";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const HISTORY_FILE = path.join(CLAUDE_DIR, "history.jsonl");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");

// Pre-built index: sessionId -> file path
let sessionFileIndex: Map<string, string> | null = null;

function buildSessionFileIndex(): Map<string, string> {
  const index = new Map<string, string>();
  if (!fs.existsSync(PROJECTS_DIR)) return index;
  try {
    const dirs = fs.readdirSync(PROJECTS_DIR);
    for (const dir of dirs) {
      const dirPath = path.join(PROJECTS_DIR, dir);
      let stat;
      try { stat = fs.statSync(dirPath); } catch { continue; }
      if (!stat.isDirectory()) continue;
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file.endsWith(".jsonl")) {
          const sessionId = file.replace(".jsonl", "");
          index.set(sessionId, path.join(dirPath, file));
        }
      }
    }
  } catch {
    // ignore
  }
  return index;
}

function getSessionFile(sessionId: string): string | null {
  if (!sessionFileIndex) {
    sessionFileIndex = buildSessionFileIndex();
  }
  return sessionFileIndex.get(sessionId) || null;
}

function extractProjectName(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "unknown";
}

function parseJsonlFile<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());
  const results: T[] = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return results;
}

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

function readSessionMeta(filePath: string): { branch: string; entrypoint: string } {
  const result = { branch: "", entrypoint: "" };
  try {
    const fd = fs.openSync(filePath, "r");
    let chunk: string;
    try {
      const buffer = Buffer.alloc(4096);
      fs.readSync(fd, buffer, 0, 4096, 0);
      chunk = buffer.toString("utf-8");
    } finally {
      fs.closeSync(fd);
    }
    const lines = chunk.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.gitBranch && !result.branch) result.branch = entry.gitBranch;
        if (entry.entrypoint && !result.entrypoint) result.entrypoint = entry.entrypoint;
        if (result.branch && result.entrypoint) break;
      } catch {
        // skip
      }
    }
  } catch {
    // ignore
  }
  return result;
}

function buildSessionNameMap(): Map<string, string> {
  const nameMap = new Map<string, string>();
  if (!fs.existsSync(SESSIONS_DIR)) return nameMap;
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8")
        );
        if (data.sessionId && data.name) {
          nameMap.set(data.sessionId, data.name);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // ignore
  }
  return nameMap;
}

export function parseSessions(): Session[] {
  // Reset file index for fresh scan
  sessionFileIndex = null;

  const sessionNames = buildSessionNameMap();
  const entries = parseJsonlFile<HistoryEntry>(HISTORY_FILE);

  // Group by sessionId
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

  // Build sessions
  const sessions: Session[] = [];
  for (const [sessionId, data] of sessionMap) {
    const timestamps = data.entries.map((e) => e.timestamp);
    const prompts = data.entries
      .map((e) => e.display)
      .filter((d) => d && d !== "/login ");
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
      name: sessionNames.get(sessionId) || "",
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

  // Sort by most recent first
  sessions.sort((a, b) => b.endTime - a.endTime);
  return sessions;
}

export function parseSessionDetail(
  sessionId: string,
  cachedSession?: Session
): SessionDetail | null {
  const session =
    cachedSession || parseSessions().find((s) => s.id === sessionId);
  if (!session) return null;

  const sessionFile = getSessionFile(sessionId);
  if (!sessionFile) {
    return { ...session, messages: [] };
  }

  const entries = parseJsonlFile<SessionEntry>(sessionFile);
  const messages: Message[] = [];

  for (const entry of entries) {
    if (!entry.message || !entry.message.role) continue;
    if (entry.type === "file-history-snapshot") continue;
    if (entry.isSidechain) continue;

    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;

    let content = "";
    if (typeof entry.message.content === "string") {
      content = entry.message.content;
    } else if (Array.isArray(entry.message.content)) {
      content = entry.message.content
        .map((block) => block.text || "")
        .filter(Boolean)
        .join("\n");
    }

    if (!content.trim()) continue;

    messages.push({
      role: role as "user" | "assistant",
      content,
      timestamp: entry.timestamp || "",
    });
  }

  return {
    ...session,
    messages,
    messageCount: messages.length,
  };
}

export function groupSessions(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, Session[]>();
  const order = ["Today", "Yesterday", "This Week", "This Month", "Older"];

  for (const session of sessions) {
    const label = getDateGroup(session.endTime);
    const group = groups.get(label) || [];
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

export function getUniqueProjects(sessions: Session[]): string[] {
  return [...new Set(sessions.map((s) => s.project))].sort();
}

export function searchSessions(sessions: Session[], query: string): Session[] {
  const lower = query.toLowerCase();
  return sessions.filter(
    (s) =>
      s.project.toLowerCase().includes(lower) ||
      s.branch.toLowerCase().includes(lower) ||
      s.summary.toLowerCase().includes(lower) ||
      s.prompts.some((p) => p.toLowerCase().includes(lower))
  );
}

export function filterSessions(
  sessions: Session[],
  filters: {
    project?: string;
    branch?: string;
    dateRange?: [number, number];
  }
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
