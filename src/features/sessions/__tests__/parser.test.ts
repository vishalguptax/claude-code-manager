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

function writePidFile(pid: number, sessionId: string) {
  fs.writeFileSync(
    path.join(SESSIONS_DIR, `${pid}.json`),
    JSON.stringify({ pid, sessionId }),
  );
}

// Import parser AFTER mocks are set up
import {
  parseSessions,
  parseSessionDetail,
  groupSessions,
  getStats,
  searchSessions,
  filterSessions,
  getLastParseWarning,
  reparseOneSession,
  invalidateSessionMetaCache,
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

  it("uses CLI ai-title as session name (priority above auto-summary)", () => {
    writeHistoryEntry({
      display: "first prompt that would otherwise be summary",
      timestamp: Date.now(),
      project: "/projects/ai-title-app",
      sessionId: "sess-ai-title",
    });
    writeSessionFile("ai-title-hash", "sess-ai-title", [
      { type: "summary", summary: "older auto summary text", sessionId: "sess-ai-title" },
      { type: "ai-title", aiTitle: "Debug heatmap not working", sessionId: "sess-ai-title" },
      {
        message: { role: "user", content: "first prompt" },
        timestamp: "2026-04-20T15:00:00.000Z",
      },
    ]);

    const sessions = parseSessions();
    const sess = sessions.find((s) => s.id === "sess-ai-title");
    expect(sess!.name).toBe("Debug heatmap not working");
  });

  it("uses latest ai-title when multiple are emitted", () => {
    writeHistoryEntry({
      display: "x",
      timestamp: Date.now(),
      project: "/projects/multi-title",
      sessionId: "sess-multi",
    });
    writeSessionFile("multi-hash", "sess-multi", [
      { type: "ai-title", aiTitle: "First topic", sessionId: "sess-multi" },
      {
        message: { role: "user", content: "x" },
        timestamp: "2026-04-20T15:00:00.000Z",
      },
      { type: "ai-title", aiTitle: "Second topic", sessionId: "sess-multi" },
    ]);

    const sessions = parseSessions();
    const sess = sessions.find((s) => s.id === "sess-multi");
    expect(sess!.name).toBe("Second topic");
  });

  it("user rename overrides ai-title", () => {
    writeHistoryEntry({
      display: "x",
      timestamp: Date.now(),
      project: "/projects/override",
      sessionId: "sess-override",
    });
    writeSessionFile("override-hash", "sess-override", [
      { type: "ai-title", aiTitle: "AI generated title", sessionId: "sess-override" },
      {
        message: { role: "user", content: "x" },
        timestamp: "2026-04-20T15:00:00.000Z",
      },
    ]);

    const sessions = parseSessions({ "sess-override": "user picked name" });
    const sess = sessions.find((s) => s.id === "sess-override");
    expect(sess!.name).toBe("user picked name");
  });

  it("captures ai-title for orphan (extension-originated) sessions", () => {
    const sessionId = "orphan-ai-title";
    writeSessionFile("-home-user-orphan", sessionId, [
      { type: "ai-title", aiTitle: "Refactor auth flow", sessionId },
      {
        entrypoint: "claude-vscode",
        message: { role: "user", content: "first prompt" },
        timestamp: "2026-04-20T15:00:00.000Z",
        cwd: "/home/user/orphan",
      },
    ]);

    const sessions = parseSessions();
    const sess = sessions.find((s) => s.id === sessionId);
    expect(sess!.name).toBe("Refactor auth flow");
  });

  it("discovers sessions that only exist in projects/ (no history.jsonl entry)", () => {
    // Extension-originated sessions never touch history.jsonl. We
    // simulate that here by writing the transcript file directly.
    const projectCwd = "/home/user/ext-project";
    const sessionId = "ext-sess-1";
    writeSessionFile("-home-user-ext-project", sessionId, [
      {
        type: "permission-mode",
        permissionMode: "default",
        sessionId,
      },
      {
        entrypoint: "claude-vscode",
        message: { role: "user", content: "hello from extension" },
        timestamp: "2026-04-20T15:00:00.000Z",
        cwd: projectCwd,
        gitBranch: "main",
      },
      {
        message: { role: "assistant", content: "hi" },
        timestamp: "2026-04-20T15:00:05.000Z",
        cwd: projectCwd,
      },
      {
        message: { role: "user", content: "second" },
        timestamp: "2026-04-20T15:00:10.000Z",
        cwd: projectCwd,
      },
    ]);

    const sessions = parseSessions();
    const sess = sessions.find((s) => s.id === sessionId);
    expect(sess).toBeDefined();
    expect(sess!.projectPath).toBe(projectCwd);
    expect(sess!.project).toBe("ext-project");
    expect(sess!.entrypoint).toBe("claude-vscode");
    expect(sess!.branch).toBe("main");
    expect(sess!.summary).toBe("hello from extension");
    expect(sess!.messageCount).toBe(2);
  });

  it("marks isLive true when a PID file references a running process", () => {
    writeHistoryEntry({
      display: "live one",
      timestamp: Date.now(),
      project: "/projects/live",
      sessionId: "sess-live",
    });
    writeHistoryEntry({
      display: "dead one",
      timestamp: Date.now(),
      project: "/projects/dead",
      sessionId: "sess-dead",
    });
    // process.pid is always alive inside this test. Use a tiny pid
    // (2**31-1) for the stale entry — `process.kill` returns ESRCH.
    writePidFile(process.pid, "sess-live");
    writePidFile(2147483646, "sess-dead");

    const sessions = parseSessions();
    expect(sessions.find((s) => s.id === "sess-live")!.isLive).toBe(true);
    expect(sessions.find((s) => s.id === "sess-dead")!.isLive).toBe(false);
  });

  it("skips orphan files that have no user messages (empty / queue-only shells)", () => {
    writeSessionFile("-home-user-empty", "empty-sess", [
      { type: "queue-operation", operation: "enqueue", sessionId: "empty-sess" },
      { type: "queue-operation", operation: "dequeue", sessionId: "empty-sess" },
    ]);
    const sessions = parseSessions();
    expect(sessions.find((s) => s.id === "empty-sess")).toBeUndefined();
  });

  it("does not duplicate sessions that exist in BOTH history.jsonl and projects/", () => {
    const projectCwd = "/home/user/dual-project";
    writeHistoryEntry({
      display: "from history",
      timestamp: Date.now(),
      project: projectCwd,
      sessionId: "dual-sess",
    });
    writeSessionFile("-home-user-dual-project", "dual-sess", [
      {
        message: { role: "user", content: "should not duplicate" },
        timestamp: "2026-04-20T15:00:00.000Z",
        cwd: projectCwd,
      },
    ]);
    const sessions = parseSessions();
    const matches = sessions.filter((s) => s.id === "dual-sess");
    expect(matches).toHaveLength(1);
  });
});

describe("Session pre-computed search keys", () => {
  beforeEach(setup);

  it("populates projectKey as the lowercased project name", () => {
    writeHistoryEntry({
      display: "hi",
      timestamp: Date.now(),
      project: "/home/user/My-Project",
      sessionId: "sess-1",
    });
    const sessions = parseSessions();
    expect(sessions[0].project).toBe("My-Project");
    expect(sessions[0].projectKey).toBe("my-project");
  });

  it("populates searchHaystack with all searchable fields lowercased", () => {
    writeHistoryEntry({
      display: "Fix BUG in Login flow",
      timestamp: Date.now(),
      project: "/home/user/My-App",
      sessionId: "sess-haystack",
    });
    const sessions = parseSessions();
    const h = sessions[0].searchHaystack;
    // Fields are lowercased
    expect(h).toContain("my-app");
    expect(h).toContain("fix bug in login flow");
    // Original casing not present
    expect(h).not.toContain("My-App");
    expect(h).not.toContain("BUG");
  });

  it("uses \\n separators in searchHaystack so cross-field matches do not happen", () => {
    writeHistoryEntry({
      display: "summary text",
      timestamp: Date.now(),
      project: "/home/user/proj",
      sessionId: "sess-sep",
    });
    const sessions = parseSessions();
    // The haystack contains the concatenation, so a query that spans the
    // boundary between two fields ("projsummary") must NOT match.
    expect(sessions[0].searchHaystack.includes("projsummary")).toBe(false);
    expect(sessions[0].searchHaystack.includes("proj")).toBe(true);
    expect(sessions[0].searchHaystack.includes("summary text")).toBe(true);
  });
});

describe("getLastParseWarning (schema drift detection)", () => {
  beforeEach(setup);

  it("returns null after a healthy parse", () => {
    writeHistoryEntry({
      display: "Hi",
      timestamp: Date.now(),
      project: "/p",
      sessionId: "sess-1",
    });
    parseSessions();
    expect(getLastParseWarning()).toBeNull();
  });

  it("returns null when fewer than 5 entries exist (avoids false positives)", () => {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ unrelated: true }) + "\n");
    parseSessions();
    expect(getLastParseWarning()).toBeNull();
  });

  it("returns a warning when most entries are missing required fields", () => {
    // 10 entries, all of which lack sessionId and display — simulates a
    // CLI schema rename that breaks parsing.
    for (let i = 0; i < 10; i++) {
      fs.appendFileSync(
        HISTORY_FILE,
        JSON.stringify({ promptText: `q${i}`, ts: Date.now(), proj: "/p" }) + "\n",
      );
    }
    parseSessions();
    const warning = getLastParseWarning();
    expect(warning).not.toBeNull();
    expect(warning).toMatch(/schema may have changed/i);
    expect(warning).toContain("10 of 10");
  });

  it("clears the warning on the next healthy parse", () => {
    for (let i = 0; i < 10; i++) {
      fs.appendFileSync(HISTORY_FILE, JSON.stringify({ broken: i }) + "\n");
    }
    parseSessions();
    expect(getLastParseWarning()).not.toBeNull();

    fs.writeFileSync(
      HISTORY_FILE,
      JSON.stringify({
        display: "Recovered",
        timestamp: Date.now(),
        project: "/p",
        sessionId: "sess-ok",
      }) + "\n",
    );
    parseSessions();
    expect(getLastParseWarning()).toBeNull();
  });

  it("does not warn when valid entries are mixed with a few invalid ones", () => {
    for (let i = 0; i < 10; i++) {
      writeHistoryEntry({
        display: `prompt ${i}`,
        timestamp: Date.now(),
        project: "/p",
        sessionId: `sess-${i}`,
      });
    }
    // One stray broken line — well below the 80% threshold
    fs.appendFileSync(HISTORY_FILE, JSON.stringify({ partial: true }) + "\n");
    parseSessions();
    expect(getLastParseWarning()).toBeNull();
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

  it("extracts per-message usage from assistant messages", () => {
    const now = Date.now();
    writeHistoryEntry({ display: "hi", timestamp: now, project: "/home/u/p", sessionId: "sess-u" });
    writeSessionFile("-home-u-p", "sess-u", [
      {
        timestamp: new Date(now).toISOString(),
        message: { role: "user", content: "hi" },
      },
      {
        timestamp: new Date(now + 1000).toISOString(),
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hello" }],
          model: "claude-opus-4-7",
          usage: {
            input_tokens: 10,
            output_tokens: 42,
            cache_read_input_tokens: 5000,
            cache_creation_input_tokens: 300,
          },
        },
      },
    ]);

    const detail = parseSessionDetail("sess-u");
    const assistant = detail!.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant!.usage).toEqual({
      input: 10,
      output: 42,
      cacheRead: 5000,
      cacheCreation: 300,
    });
    expect(assistant!.model).toBe("claude-opus-4-7");
  });

  it("extracts tool_use blocks with a short arg summary", () => {
    const now = Date.now();
    writeHistoryEntry({ display: "go", timestamp: now, project: "/home/u/p", sessionId: "sess-t" });
    writeSessionFile("-home-u-p", "sess-t", [
      {
        timestamp: new Date(now).toISOString(),
        message: { role: "user", content: "run stuff" },
      },
      {
        timestamp: new Date(now + 500).toISOString(),
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "on it" },
            { type: "tool_use", name: "Bash", input: { command: "git status" } },
            { type: "tool_use", name: "Read", input: { file_path: "/x/foo.ts" } },
            { type: "tool_use", name: "Grep", input: { pattern: "TODO" } },
          ],
        },
      },
    ]);

    const detail = parseSessionDetail("sess-t");
    const assistant = detail!.messages.find((m) => m.role === "assistant");
    expect(assistant!.toolUses).toEqual([
      { name: "Bash", arg: "git status" },
      { name: "Read", arg: "/x/foo.ts" },
      { name: "Grep", arg: "TODO" },
    ]);
  });

  it("extracts extended-thinking content separately from visible text", () => {
    const now = Date.now();
    writeHistoryEntry({ display: "q", timestamp: now, project: "/home/u/p", sessionId: "sess-think" });
    writeSessionFile("-home-u-p", "sess-think", [
      {
        timestamp: new Date(now).toISOString(),
        message: { role: "user", content: "?" },
      },
      {
        timestamp: new Date(now + 1).toISOString(),
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "deliberating…" },
            { type: "text", text: "answer" },
          ],
        },
      },
    ]);
    const detail = parseSessionDetail("sess-think");
    const assistant = detail!.messages.find((m) => m.role === "assistant");
    expect(assistant!.thinking).toBe("deliberating…");
    expect(assistant!.content).toBe("answer");
  });

  it("truncates oversized tool args to 120 characters with ellipsis", () => {
    const now = Date.now();
    const longCmd = "git log --format='%H %s'" + " extra".repeat(40);
    writeHistoryEntry({ display: "q", timestamp: now, project: "/home/u/p", sessionId: "sess-long" });
    writeSessionFile("-home-u-p", "sess-long", [
      {
        timestamp: new Date(now).toISOString(),
        message: { role: "user", content: "?" },
      },
      {
        timestamp: new Date(now + 1).toISOString(),
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Bash", input: { command: longCmd } },
          ],
        },
      },
    ]);
    const detail = parseSessionDetail("sess-long");
    const arg = detail!.messages[1].toolUses![0].arg;
    expect(arg.length).toBeLessThanOrEqual(120);
    expect(arg).toMatch(/…$/);
  });

  it("keeps assistant messages with tools but no text content", () => {
    const now = Date.now();
    writeHistoryEntry({ display: "q", timestamp: now, project: "/home/u/p", sessionId: "sess-nt" });
    writeSessionFile("-home-u-p", "sess-nt", [
      {
        timestamp: new Date(now).toISOString(),
        message: { role: "user", content: "read foo" },
      },
      {
        timestamp: new Date(now + 1).toISOString(),
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Read", input: { file_path: "foo" } },
          ],
        },
      },
    ]);
    const detail = parseSessionDetail("sess-nt");
    expect(detail!.messages).toHaveLength(2);
    expect(detail!.messages[1].toolUses?.length).toBe(1);
    expect(detail!.messages[1].content).toBe("");
  });

  it("query mode returns every match across the full transcript", () => {
    const now = Date.now();
    const slug = "-home-u-p";
    writeHistoryEntry({ display: "q", timestamp: now, project: "/home/u/p", sessionId: "sess-q" });
    writeSessionFile(slug, "sess-q", [
      {
        timestamp: new Date(now).toISOString(),
        message: { role: "user", content: "look at the parser bug" },
      },
      {
        timestamp: new Date(now + 1).toISOString(),
        message: { role: "assistant", content: [{ type: "text", text: "sure" }] },
      },
      {
        timestamp: new Date(now + 2).toISOString(),
        message: { role: "user", content: "another unrelated message" },
      },
      {
        timestamp: new Date(now + 3).toISOString(),
        message: { role: "assistant", content: [{ type: "text", text: "more parser notes" }] },
      },
    ]);

    const detail = parseSessionDetail("sess-q", undefined, "last", "parser");
    expect(detail!.detailQuery).toBe("parser");
    expect(detail!.totalMessages).toBe(4);
    expect(detail!.messages).toHaveLength(2);
    expect(detail!.totalMatches).toBe(2);
  });

  it("query mode matches thinking + tool_use fields too", () => {
    const now = Date.now();
    writeHistoryEntry({ display: "q", timestamp: now, project: "/home/u/p", sessionId: "sess-qt" });
    writeSessionFile("-home-u-p", "sess-qt", [
      {
        timestamp: new Date(now).toISOString(),
        message: { role: "user", content: "go" },
      },
      {
        timestamp: new Date(now + 1).toISOString(),
        message: {
          role: "assistant",
          content: [{ type: "thinking", thinking: "considering refactor" }],
        },
      },
      {
        timestamp: new Date(now + 2).toISOString(),
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Bash", input: { command: "npm test" } },
          ],
        },
      },
    ]);

    const thinkHit = parseSessionDetail("sess-qt", undefined, "last", "refactor");
    expect(thinkHit!.totalMatches).toBe(1);

    const toolHit = parseSessionDetail("sess-qt", undefined, "last", "npm test");
    expect(toolHit!.totalMatches).toBe(1);
  });

  it("empty/whitespace query reverts to paged mode", () => {
    const now = Date.now();
    writeHistoryEntry({ display: "q", timestamp: now, project: "/home/u/p", sessionId: "sess-empty-q" });
    writeSessionFile("-home-u-p", "sess-empty-q", [
      {
        timestamp: new Date(now).toISOString(),
        message: { role: "user", content: "hi" },
      },
    ]);
    const detail = parseSessionDetail("sess-empty-q", undefined, "last", "   ");
    expect(detail!.detailQuery).toBeUndefined();
    expect(detail!.totalMatches).toBeUndefined();
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
    // searchHaystack is built at construction, so renames need a fresh
    // build to be searchable. makeSession with summary="caching-refactor"
    // is the simplest way to get that into the haystack via the existing
    // factory.
    const s = [makeSession("x", now, "proj", 1, "", "caching-refactor")];
    expect(searchSessions(s, "caching")).toHaveLength(1);
  });

  it("matches across prompts array (slow path)", () => {
    // prompts are not in the haystack — they're scanned on the slow path
    // when the haystack misses. Override prompts after construction so
    // the haystack does NOT contain "caching" but prompts do.
    const base = makeSession("x", now, "proj", 1, "", "first prompt");
    const s = [{ ...base, prompts: ["first prompt", "second prompt about caching"] }];
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

describe("reparseOneSession", () => {
  beforeEach(setup);

  it("returns null when the session id is unknown", () => {
    expect(reparseOneSession("never-existed")).toBeNull();
  });

  it("returns the freshly-parsed Session for an existing id", () => {
    const now = Date.now();
    writeHistoryEntry({
      display: "first",
      timestamp: now,
      project: "/projects/r",
      sessionId: "rep-1",
    });
    writeSessionFile("r-hash", "rep-1", [
      { gitBranch: "main", entrypoint: "cli", sessionId: "rep-1" },
      {
        message: { role: "user", content: "first" },
        timestamp: new Date(now).toISOString(),
      },
    ]);
    // Prime caches.
    parseSessions();

    const fresh = reparseOneSession("rep-1");
    expect(fresh).not.toBeNull();
    expect(fresh!.id).toBe("rep-1");
    expect(fresh!.branch).toBe("main");
  });

  it("invalidateSessionMetaCache forces a re-read for the named file", () => {
    const now = Date.now();
    writeHistoryEntry({
      display: "x",
      timestamp: now,
      project: "/projects/r2",
      sessionId: "rep-2",
    });
    writeSessionFile("r2-hash", "rep-2", [
      { gitBranch: "old", sessionId: "rep-2" },
      {
        message: { role: "user", content: "x" },
        timestamp: new Date(now).toISOString(),
      },
    ]);
    const sess = parseSessions();
    expect(sess.find((s) => s.id === "rep-2")?.branch).toBe("old");

    // Rewrite the transcript with a new branch + future mtime so the
    // mtime cache key advances.
    writeSessionFile("r2-hash", "rep-2", [
      { gitBranch: "new", sessionId: "rep-2" },
      {
        message: { role: "user", content: "x" },
        timestamp: new Date(now).toISOString(),
      },
    ]);
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(
      path.join(PROJECTS_DIR, "r2-hash", "rep-2.jsonl"),
      future,
      future,
    );
    invalidateSessionMetaCache(
      path.join(PROJECTS_DIR, "r2-hash", "rep-2.jsonl"),
    );

    const refreshed = parseSessions();
    expect(refreshed.find((s) => s.id === "rep-2")?.branch).toBe("new");
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
  const name = "";
  return {
    id,
    name,
    project,
    projectPath: `/projects/${project}`,
    branch,
    entrypoint: "",
    startTime: endTime - 10000,
    endTime,
    messageCount,
    summary,
    prompts: [summary],
    projectKey: project.toLowerCase(),
    searchHaystack: `${name}\n${project}\n${branch}\n${summary}`.toLowerCase(),
  };
}
