import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// vi.hoisted runs before vi.mock hoisting, so these are available in the factory
const { CLAUDE_DIR, HISTORY_FILE, PROJECTS_DIR, SESSIONS_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const dir = _path.join(_os.tmpdir(), ".claude-test-parser");
  return {
    CLAUDE_DIR: dir,
    HISTORY_FILE: _path.join(dir, "history.jsonl"),
    PROJECTS_DIR: _path.join(dir, "projects"),
    SESSIONS_DIR: _path.join(dir, "sessions"),
  };
});

vi.mock("../../../core/config", () => ({
  HISTORY_FILE,
  PROJECTS_DIR,
  SESSIONS_DIR,
  SESSION_META_READ_BYTES: 4096,
}));

function setup() {
  fs.rmSync(CLAUDE_DIR, { recursive: true, force: true });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function writeHistoryEntry(entry: {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}) {
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(entry) + "\n");
}

function writeSessionFile(
  projectDir: string,
  sessionId: string,
  entries: object[],
) {
  const dir = path.join(PROJECTS_DIR, projectDir);
  fs.mkdirSync(dir, { recursive: true });
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), content);
}

// Import parser AFTER mocks are set up
import {
  parseSessions,
  parseSessionDetail,
  groupSessions,
  getStats,
  searchSessions,
  filterSessions,
} from "../parser";

describe("parseSessions", () => {
  beforeEach(setup);

  it("returns an empty array when history file does not exist", () => {
    fs.rmSync(HISTORY_FILE, { force: true });
    expect(parseSessions()).toEqual([]);
  });

  it("parses a single session from history entries", () => {
    const now = Date.now();
    writeHistoryEntry({
      display: "Hello world",
      timestamp: now - 5000,
      project: "/home/user/my-project",
      sessionId: "sess-1",
    });
    writeHistoryEntry({
      display: "Follow-up question",
      timestamp: now,
      project: "/home/user/my-project",
      sessionId: "sess-1",
    });

    const sessions = parseSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("sess-1");
    expect(sessions[0].project).toBe("my-project");
    expect(sessions[0].messageCount).toBe(2);
    expect(sessions[0].summary).toBe("Hello world");
  });

  it("sorts sessions by most recent endTime first", () => {
    const now = Date.now();
    writeHistoryEntry({
      display: "Old session",
      timestamp: now - 100000,
      project: "/projects/old",
      sessionId: "sess-old",
    });
    writeHistoryEntry({
      display: "New session",
      timestamp: now,
      project: "/projects/new",
      sessionId: "sess-new",
    });

    const sessions = parseSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("sess-new");
    expect(sessions[1].id).toBe("sess-old");
  });

  it("skips entries with display '/login '", () => {
    writeHistoryEntry({
      display: "/login ",
      timestamp: Date.now(),
      project: "/p",
      sessionId: "sess-login",
    });

    const sessions = parseSessions();
    expect(sessions).toHaveLength(0);
  });

  it("truncates summary to 100 chars", () => {
    const longPrompt = "A".repeat(150);
    writeHistoryEntry({
      display: longPrompt,
      timestamp: Date.now(),
      project: "/p",
      sessionId: "sess-long",
    });

    const sessions = parseSessions();
    expect(sessions[0].summary).toHaveLength(103); // 100 + "..."
    expect(sessions[0].summary.endsWith("...")).toBe(true);
  });

  it("reads branch and entrypoint from session JSONL metadata", () => {
    const now = Date.now();
    writeHistoryEntry({
      display: "test",
      timestamp: now,
      project: "/projects/myapp",
      sessionId: "sess-meta",
    });
    writeSessionFile("myapp-hash", "sess-meta", [
      { gitBranch: "feature/auth", entrypoint: "cli", sessionId: "sess-meta" },
      {
        message: { role: "user", content: "test" },
        timestamp: new Date().toISOString(),
      },
    ]);

    const sessions = parseSessions();
    expect(sessions[0].branch).toBe("feature/auth");
    expect(sessions[0].entrypoint).toBe("cli");
  });
});

describe("parseSessionDetail", () => {
  beforeEach(setup);

  it("returns null for a non-existent session", () => {
    expect(parseSessionDetail("nonexistent")).toBeNull();
  });

  it("returns messages from the session JSONL file", () => {
    const now = Date.now();
    writeHistoryEntry({
      display: "Explain closures",
      timestamp: now,
      project: "/projects/learn",
      sessionId: "sess-detail",
    });
    writeSessionFile("learn-hash", "sess-detail", [
      { gitBranch: "main", sessionId: "sess-detail" },
      {
        message: { role: "user", content: "Explain closures" },
        timestamp: new Date(now).toISOString(),
      },
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "A closure is..." }],
        },
        timestamp: new Date(now + 1000).toISOString(),
      },
      // Side-chain entries should be skipped
      {
        message: { role: "assistant", content: "sidechain" },
        isSidechain: true,
        timestamp: new Date(now + 2000).toISOString(),
      },
      // file-history-snapshot entries should be skipped
      {
        type: "file-history-snapshot",
        message: { role: "user", content: "snapshot" },
        timestamp: new Date(now + 3000).toISOString(),
      },
    ]);

    const detail = parseSessionDetail("sess-detail");
    expect(detail).not.toBeNull();
    expect(detail!.messages).toHaveLength(2);
    expect(detail!.messages[0].role).toBe("user");
    expect(detail!.messages[0].content).toBe("Explain closures");
    expect(detail!.messages[1].role).toBe("assistant");
    expect(detail!.messages[1].content).toBe("A closure is...");
  });

  it("uses cached session when provided", () => {
    const cachedSession = {
      id: "cached-sess",
      name: "",
      project: "test",
      projectPath: "/test",
      branch: "",
      entrypoint: "",
      startTime: Date.now(),
      endTime: Date.now(),
      messageCount: 0,
      summary: "cached",
      prompts: ["cached"],
    };

    // No session file exists, so messages will be empty
    const detail = parseSessionDetail("cached-sess", cachedSession);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe("cached-sess");
    expect(detail!.messages).toEqual([]);
  });
});

describe("groupSessions", () => {
  it("groups sessions by date labels in the correct order", () => {
    const now = Date.now();
    const sessions = [
      makeSession("a", now),
      makeSession("b", now - 2 * 86400000), // 2 days ago = This Week
      makeSession("c", now - 40 * 86400000), // 40 days ago = Older
    ];

    const groups = groupSessions(sessions);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups[0].label).toBe("Today");
    // "This Week" or "Older" depending on exact timing
    const labels = groups.map((g) => g.label);
    expect(labels).toContain("Older");
  });

  it("returns empty array for no sessions", () => {
    expect(groupSessions([])).toEqual([]);
  });

  it("omits empty groups", () => {
    const now = Date.now();
    const groups = groupSessions([makeSession("a", now)]);
    // Should only have "Today", not Yesterday/This Week/etc.
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
  });
});

describe("getStats", () => {
  it("computes correct statistics", () => {
    const now = Date.now();
    const sessions = [
      makeSession("a", now, "proj-a", 5),
      makeSession("b", now, "proj-b", 3),
      makeSession("c", now - 20 * 86400000, "proj-a", 2),
    ];

    const stats = getStats(sessions);
    expect(stats.totalSessions).toBe(3);
    expect(stats.totalProjects).toBe(2);
    expect(stats.thisWeek).toBe(2); // only first two are within 7 days
    expect(stats.totalMessages).toBe(10);
  });

  it("returns zeros for empty input", () => {
    const stats = getStats([]);
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalProjects).toBe(0);
    expect(stats.thisWeek).toBe(0);
    expect(stats.totalMessages).toBe(0);
  });
});

describe("searchSessions", () => {
  const now = Date.now();
  const sessions = [
    makeSession("a", now, "my-app", 1, "main", "Fix bug in login"),
    makeSession("b", now, "backend", 1, "feature/api", "Add REST endpoints"),
    makeSession("c", now, "frontend", 1, "", "Style the dashboard"),
  ];

  it("matches on project name (case-insensitive)", () => {
    const result = searchSessions(sessions, "MY-APP");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("matches on branch name", () => {
    const result = searchSessions(sessions, "feature/api");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("matches on summary text", () => {
    const result = searchSessions(sessions, "dashboard");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c");
  });

  it("returns empty for no matches", () => {
    expect(searchSessions(sessions, "nonexistent")).toEqual([]);
  });

  it("matches on session name", () => {
    const s = [
      {
        ...makeSession("x", now, "proj"),
        name: "caching-refactor",
      },
    ];
    expect(searchSessions(s, "caching")).toHaveLength(1);
  });
});

describe("filterSessions", () => {
  const now = Date.now();
  const sessions = [
    makeSession("a", now, "alpha", 1, "main"),
    makeSession("b", now, "beta", 1, "dev"),
    makeSession("c", now - 15 * 86400000, "alpha", 1, "main"),
  ];

  it("filters by project", () => {
    const result = filterSessions(sessions, { project: "alpha" });
    expect(result).toHaveLength(2);
  });

  it("filters by branch", () => {
    const result = filterSessions(sessions, { branch: "dev" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("filters by date range", () => {
    const weekAgo = now - 7 * 86400000;
    const result = filterSessions(sessions, { dateRange: [weekAgo, now] });
    expect(result).toHaveLength(2); // "c" is 15 days old, excluded
  });

  it("applies multiple filters together", () => {
    const weekAgo = now - 7 * 86400000;
    const result = filterSessions(sessions, {
      project: "alpha",
      dateRange: [weekAgo, now],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("returns all sessions when no filters are provided", () => {
    expect(filterSessions(sessions, {})).toHaveLength(3);
  });
});

// ── Helper ──

function makeSession(
  id: string,
  endTime: number,
  project = "test-project",
  messageCount = 1,
  branch = "",
  summary = "test prompt",
) {
  return {
    id,
    name: "",
    project,
    projectPath: `/projects/${project}`,
    branch,
    entrypoint: "",
    startTime: endTime - 10000,
    endTime,
    messageCount,
    summary,
    prompts: [summary],
  };
}
