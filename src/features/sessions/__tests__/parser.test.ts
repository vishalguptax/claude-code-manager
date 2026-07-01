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

function writePidFile(
  pid: number,
  sessionId: string,
  extra: Record<string, unknown> = {},
) {
  fs.writeFileSync(
    path.join(SESSIONS_DIR, `${pid}.json`),
    JSON.stringify({ pid, sessionId, ...extra }),
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
  clearMetaCaches,
  clearOrphanCache,
  clearPendingCache,
  readLiveSessions,
  applyLiveState,
} from "../parser";
import type { Session } from "../types";

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

  it("first-prompt summary outranks the CLI PID-file slug for a new session", () => {
    // A brand-new live session has a PID-file `name` slug (e.g. project-4b)
    // but no ai-title/meta-summary yet. The descriptive first prompt must win
    // over the generic slug.
    writeHistoryEntry({
      display: "add pairing retry to the BLE flow",
      timestamp: Date.now(),
      project: "/projects/keus-iot-platform",
      sessionId: "sess-slug-new",
    });
    writePidFile(process.pid, "sess-slug-new", { name: "keus-iot-platform-4b" });

    const sessions = parseSessions();
    const sess = sessions.find((s) => s.id === "sess-slug-new");
    expect(sess!.name).toBe("add pairing retry to the BLE flow");
  });

  it("ai-title outranks the CLI PID-file slug", () => {
    writeHistoryEntry({
      display: "x",
      timestamp: Date.now(),
      project: "/projects/keus-iot-platform",
      sessionId: "sess-slug-aititle",
    });
    writeSessionFile("slug-aititle-hash", "sess-slug-aititle", [
      { type: "ai-title", aiTitle: "Fix version bump workflow", sessionId: "sess-slug-aititle" },
      { message: { role: "user", content: "x" }, timestamp: "2026-04-20T15:00:00.000Z" },
    ]);
    writePidFile(process.pid, "sess-slug-aititle", { name: "keus-iot-platform-91" });

    const sessions = parseSessions();
    const sess = sessions.find((s) => s.id === "sess-slug-aititle");
    expect(sess!.name).toBe("Fix version bump workflow");
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

  it("populates status and liveUpdatedAt from the PID file", () => {
    writeHistoryEntry({
      display: "with status",
      timestamp: Date.now(),
      project: "/projects/withstatus",
      sessionId: "sess-status",
    });
    writePidFile(process.pid, "sess-status", {
      status: "busy",
      updatedAt: 1700000000000,
    });

    const sess = parseSessions().find((s) => s.id === "sess-status")!;
    expect(sess.isLive).toBe(true);
    expect(sess.status).toBe("busy");
    expect(sess.liveUpdatedAt).toBe(1700000000000);
  });

  it("status and liveUpdatedAt are undefined for dead-PID and missing-field cases", () => {
    writeHistoryEntry({
      display: "dead",
      timestamp: Date.now(),
      project: "/projects/dead2",
      sessionId: "sess-dead2",
    });
    writeHistoryEntry({
      display: "no status field",
      timestamp: Date.now(),
      project: "/projects/nostatus",
      sessionId: "sess-nostatus",
    });
    writePidFile(2147483646, "sess-dead2", {
      status: "busy",
      updatedAt: 1700000000000,
    });
    writePidFile(process.pid, "sess-nostatus");

    const sessions = parseSessions();
    const dead = sessions.find((s) => s.id === "sess-dead2")!;
    expect(dead.isLive).toBe(false);
    expect(dead.status).toBeUndefined();
    expect(dead.liveUpdatedAt).toBeUndefined();
    const noStatus = sessions.find((s) => s.id === "sess-nostatus")!;
    expect(noStatus.isLive).toBe(true);
    expect(noStatus.status).toBe("");
    expect(noStatus.liveUpdatedAt).toBe(0);
  });

  it("prefers the most recent alive PID file when duplicates exist for one sessionId", () => {
    writeHistoryEntry({
      display: "dup",
      timestamp: Date.now(),
      project: "/projects/dup",
      sessionId: "sess-dup",
    });
    // Older alive entry — written first.
    writePidFile(process.pid, "sess-dup", {
      status: "idle",
      updatedAt: 1000,
    });
    // Stale dead-PID entry with a higher updatedAt. Must be ignored
    // because its PID is no longer alive — otherwise a leftover crash
    // file with a fresher timestamp would shadow the real session.
    writePidFile(2147483646, "sess-dup", {
      status: "busy",
      updatedAt: 9999,
    });

    const sess = parseSessions().find((s) => s.id === "sess-dup")!;
    expect(sess.isLive).toBe(true);
    expect(sess.status).toBe("idle");
    expect(sess.liveUpdatedAt).toBe(1000);
  });

  it("skips malformed PID files without dropping sibling entries", () => {
    writeHistoryEntry({
      display: "good",
      timestamp: Date.now(),
      project: "/projects/good",
      sessionId: "sess-good",
    });
    // Truncated JSON — emulates a partial heartbeat write.
    fs.writeFileSync(path.join(SESSIONS_DIR, "99999.json"), "{\"pid\":");
    writePidFile(process.pid, "sess-good", { status: "busy" });

    const sess = parseSessions().find((s) => s.id === "sess-good")!;
    expect(sess.isLive).toBe(true);
    expect(sess.status).toBe("busy");
  });
});

describe("readLiveSessions", () => {
  beforeEach(setup);

  it("returns an empty map when the sessions dir does not exist", () => {
    fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
    expect(readLiveSessions().size).toBe(0);
  });

  it("returns one entry per alive sessionId with status and updatedAt", () => {
    writePidFile(process.pid, "sess-x", {
      status: "busy",
      updatedAt: 12345,
    });
    const map = readLiveSessions();
    expect(map.get("sess-x")).toEqual({
      pid: process.pid,
      status: "busy",
      updatedAt: 12345,
    });
  });
});

describe("applyLiveState", () => {
  function mkSession(id: string, isLive = false, status?: string): Session {
    return {
      id,
      name: "",
      project: "p",
      projectPath: "/p",
      branch: "",
      entrypoint: "",
      startTime: 0,
      endTime: 0,
      messageCount: 0,
      summary: "",
      prompts: [],
      projectKey: "p",
      searchHaystack: "",
      isLive,
      status,
    };
  }

  it("flips isLive on when the session appears in the live map", () => {
    const sessions = [mkSession("s1", false)];
    const live = new Map([
      ["s1", { pid: 1, status: "busy", updatedAt: 100 }],
    ]);
    expect(applyLiveState(sessions, live)).toBe(true);
    expect(sessions[0].isLive).toBe(true);
    expect(sessions[0].status).toBe("busy");
    expect(sessions[0].liveUpdatedAt).toBe(100);
  });

  it("flips isLive off when the session leaves the live map", () => {
    const sessions = [mkSession("s1", true, "busy")];
    sessions[0].liveUpdatedAt = 100;
    expect(applyLiveState(sessions, new Map())).toBe(true);
    expect(sessions[0].isLive).toBe(false);
    expect(sessions[0].status).toBeUndefined();
    expect(sessions[0].liveUpdatedAt).toBeUndefined();
  });

  it("returns false when nothing changed", () => {
    const sessions = [mkSession("s1", true, "busy")];
    sessions[0].liveUpdatedAt = 100;
    const live = new Map([
      ["s1", { pid: 1, status: "busy", updatedAt: 100 }],
    ]);
    expect(applyLiveState(sessions, live)).toBe(false);
  });

  it("detects status-only changes", () => {
    const sessions = [mkSession("s1", true, "busy")];
    sessions[0].liveUpdatedAt = 100;
    const live = new Map([
      ["s1", { pid: 1, status: "idle", updatedAt: 100 }],
    ]);
    expect(applyLiveState(sessions, live)).toBe(true);
    expect(sessions[0].status).toBe("idle");
  });

  it("skips orphan files that have no user messages (empty / queue-only shells)", () => {
    writeSessionFile("-home-user-empty", "empty-sess", [
      { type: "queue-operation", operation: "enqueue", sessionId: "empty-sess" },
      { type: "queue-operation", operation: "dequeue", sessionId: "empty-sess" },
    ]);
    const sessions = parseSessions();
    expect(sessions.find((s) => s.id === "empty-sess")).toBeUndefined();
  });

  it("clearOrphanCache re-streams a changed orphan transcript", () => {
    writeSessionFile("-home-user-orphclr", "orph-clr", [
      {
        message: { role: "user", content: "first prompt" },
        timestamp: "2026-04-20T15:00:00.000Z",
        cwd: "/home/user/orphclr",
      },
    ]);
    expect(parseSessions().find((s) => s.id === "orph-clr")).toBeDefined();

    // Rewrite with a future mtime so the orphan cache key advances, then
    // clear the cache (global-reload path) — the next parse must re-read.
    writeSessionFile("-home-user-orphclr", "orph-clr", [
      {
        message: { role: "user", content: "rewritten prompt" },
        timestamp: "2026-04-20T15:05:00.000Z",
        cwd: "/home/user/orphclr",
      },
    ]);
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(PROJECTS_DIR, "-home-user-orphclr", "orph-clr.jsonl"), future, future);
    clearOrphanCache();

    expect(parseSessions().find((s) => s.id === "orph-clr")).toBeDefined();
  });

  it("clearPendingCache is callable and leaves a subsequent parse working", () => {
    writeSessionFile("-home-user-pendclr", "pend-clr", [
      {
        message: { role: "user", content: "hello" },
        timestamp: "2026-04-20T15:00:00.000Z",
        cwd: "/home/user/pendclr",
      },
    ]);
    parseSessions();
    expect(() => clearPendingCache()).not.toThrow();
    expect(parseSessions().find((s) => s.id === "pend-clr")).toBeDefined();
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

describe("pending-question detection (idle → awaiting_question)", () => {
  beforeEach(setup);

  function projectSlugFor(id: string): string {
    return `-projects-pending-${id.slice(0, 4)}`;
  }

  it("promotes idle to awaiting_question when an AskUserQuestion has no tool_result", () => {
    const id = "sess-pq-1";
    writeHistoryEntry({
      display: "needs answer",
      timestamp: Date.now(),
      project: "/projects/pending",
      sessionId: id,
    });
    writeSessionFile(projectSlugFor(id), id, [
      { type: "user", message: { role: "user", content: "do thing" } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tu_1",
              name: "AskUserQuestion",
              input: { question: "which?" },
            },
          ],
        },
      },
    ]);
    writePidFile(process.pid, id, { status: "idle", updatedAt: 1 });

    const sess = parseSessions().find((s) => s.id === id)!;
    expect(sess.status).toBe("awaiting_question");
  });

  it("leaves status as idle once the tool_result for the question lands", () => {
    const id = "sess-pq-2";
    writeHistoryEntry({
      display: "answered",
      timestamp: Date.now(),
      project: "/projects/pending",
      sessionId: id,
    });
    writeSessionFile(projectSlugFor(id), id, [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tu_42",
              name: "AskUserQuestion",
              input: { question: "which?" },
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tu_42", content: "option A" },
          ],
        },
      },
    ]);
    writePidFile(process.pid, id, { status: "idle", updatedAt: 1 });

    const sess = parseSessions().find((s) => s.id === id)!;
    expect(sess.status).toBe("idle");
  });

  it("does not promote idle when the unanswered tool_use is a non-blocking tool", () => {
    const id = "sess-pq-3";
    writeHistoryEntry({
      display: "non-blocking",
      timestamp: Date.now(),
      project: "/projects/pending",
      sessionId: id,
    });
    writeSessionFile(projectSlugFor(id), id, [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tu_7",
              name: "Read",
              input: { file_path: "/x" },
            },
          ],
        },
      },
    ]);
    writePidFile(process.pid, id, { status: "idle", updatedAt: 1 });

    const sess = parseSessions().find((s) => s.id === id)!;
    expect(sess.status).toBe("idle");
  });

  it("also triggers for unanswered ExitPlanMode tool_use", () => {
    const id = "sess-pq-4";
    writeHistoryEntry({
      display: "plan",
      timestamp: Date.now(),
      project: "/projects/pending",
      sessionId: id,
    });
    writeSessionFile(projectSlugFor(id), id, [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tu_plan",
              name: "ExitPlanMode",
              input: { plan: "do x" },
            },
          ],
        },
      },
    ]);
    writePidFile(process.pid, id, { status: "idle", updatedAt: 1 });

    const sess = parseSessions().find((s) => s.id === id)!;
    expect(sess.status).toBe("awaiting_question");
  });

  it("surfaces awaiting_question even when the CLI status is a stale 'busy'", () => {
    // The CLI only rewrites `status` on a change and routinely leaves it
    // frozen at "busy" while actually blocked on the user, which used to show
    // the green "busy" dot for a pending question. An unanswered
    // AskUserQuestion in the transcript is definitive, so it now overrides.
    const id = "sess-pq-5";
    writeHistoryEntry({
      display: "busy with pending",
      timestamp: Date.now(),
      project: "/projects/pending",
      sessionId: id,
    });
    writeSessionFile(projectSlugFor(id), id, [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tu_busy",
              name: "AskUserQuestion",
              input: { question: "?" },
            },
          ],
        },
      },
    ]);
    writePidFile(process.pid, id, { status: "busy", updatedAt: 1 });

    const sess = parseSessions().find((s) => s.id === id)!;
    expect(sess.status).toBe("awaiting_question");
  });

  it("leaves a genuine 'busy' session (no pending question) as busy", () => {
    const id = "sess-pq-7";
    writeHistoryEntry({
      display: "genuinely busy",
      timestamp: Date.now(),
      project: "/projects/pending",
      sessionId: id,
    });
    writeSessionFile(projectSlugFor(id), id, [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "tu_read", name: "Read", input: {} }],
        },
      },
    ]);
    writePidFile(process.pid, id, { status: "busy", updatedAt: 1 });

    const sess = parseSessions().find((s) => s.id === id)!;
    expect(sess.status).toBe("busy");
  });

  it("applyLiveState refines status to awaiting_question on a cached session", () => {
    const id = "sess-pq-6";
    writeHistoryEntry({
      display: "cache path",
      timestamp: Date.now(),
      project: "/projects/pending",
      sessionId: id,
    });
    writeSessionFile(projectSlugFor(id), id, [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tu_a",
              name: "AskUserQuestion",
              input: { question: "?" },
            },
          ],
        },
      },
    ]);
    // Seed parser caches so getSessionFile resolves the transcript path.
    parseSessions();

    const sessions: Session[] = [
      {
        id,
        name: "",
        project: "pending",
        projectPath: "/projects/pending",
        branch: "",
        entrypoint: "",
        startTime: 0,
        endTime: 0,
        messageCount: 0,
        summary: "",
        prompts: [],
        projectKey: "pending",
        searchHaystack: "",
        isLive: false,
        status: undefined,
      },
    ];
    const live = new Map([
      [id, { pid: process.pid, status: "idle", updatedAt: 2 }],
    ]);
    expect(applyLiveState(sessions, live)).toBe(true);
    expect(sessions[0].status).toBe("awaiting_question");
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

  it("clearMetaCaches forces a cold re-parse without targeting a single file", () => {
    const now = Date.now();
    writeHistoryEntry({
      display: "x",
      timestamp: now,
      project: "/projects/r3",
      sessionId: "rep-3",
    });
    writeSessionFile("r3-hash", "rep-3", [
      { gitBranch: "old", sessionId: "rep-3" },
      {
        message: { role: "user", content: "x" },
        timestamp: new Date(now).toISOString(),
      },
    ]);
    expect(parseSessions().find((s) => s.id === "rep-3")?.branch).toBe("old");

    // Rewrite with a new branch + future mtime, then clear ALL caches
    // (the global-reload path) rather than invalidating one file.
    writeSessionFile("r3-hash", "rep-3", [
      { gitBranch: "new", sessionId: "rep-3" },
      {
        message: { role: "user", content: "x" },
        timestamp: new Date(now).toISOString(),
      },
    ]);
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(PROJECTS_DIR, "r3-hash", "rep-3.jsonl"), future, future);
    clearMetaCaches();

    expect(parseSessions().find((s) => s.id === "rep-3")?.branch).toBe("new");
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
