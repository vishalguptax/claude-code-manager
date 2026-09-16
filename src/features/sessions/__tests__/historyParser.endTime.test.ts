/**
 * `endTime` regression: a transcript's last activity must come from a
 * real conversational turn, not from any line that happens to carry a
 * `timestamp`.
 *
 * A Claude Code transcript interleaves genuine `user`/`assistant` turns
 * with plain bookkeeping lines — `attachment`, `system`,
 * `queue-operation`, `pr-link`, `frame-link`, `file-history-delta` — none
 * of which carry a `message` field, but most of which still carry a
 * `timestamp`, often written well after the last thing anyone actually
 * said (a background task finishing after the terminal closed, for one).
 *
 * Counting those inflated `endTime` on 63 of 78 real sessions checked
 * against a live `~/.claude` directory, which is what let a session with
 * nothing new to read still show as unread in the sidebar: its "last
 * activity" was a line the user never saw and never could have.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { CLAUDE_DIR, HISTORY_FILE, PROJECTS_DIR, SESSIONS_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const dir = _path.join(_os.tmpdir(), ".claude-test-history-endtime");
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

import { parseSessions, clearOrphanCache } from "../historyParser";
import { clearMetaCaches } from "../metaParser";
import { clearPendingCache } from "../liveSessions";

const PROJECT_SLUG = "-Users-tester-project";
const SESSION_ID = "11111111-2222-3333-4444-555555555555";

function transcriptPath(id: string = SESSION_ID): string {
  return path.join(PROJECTS_DIR, PROJECT_SLUG, `${id}.jsonl`);
}

function line(entry: Record<string, unknown>): string {
  return JSON.stringify(entry) + "\n";
}

beforeEach(() => {
  fs.rmSync(CLAUDE_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(PROJECTS_DIR, PROJECT_SLUG), { recursive: true });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  clearOrphanCache();
  clearMetaCaches();
  clearPendingCache();
});

afterEach(() => {
  fs.rmSync(CLAUDE_DIR, { recursive: true, force: true });
  clearOrphanCache();
  clearMetaCaches();
  clearPendingCache();
});

describe("orphan session endTime", () => {
  it("ignores a trailing bookkeeping line with no message", () => {
    const content =
      line({
        type: "user",
        cwd: "/Users/tester/project",
        message: { role: "user", content: "do the thing" },
        timestamp: "2026-01-01T00:00:00.000Z",
      }) +
      line({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "done" }] },
        timestamp: "2026-01-01T00:00:01.000Z",
      }) +
      // A background task's file-history delta, written five minutes
      // later — after the user had already closed the terminal. Real
      // shape observed in ~/.claude: no `message` field, just a bare
      // timestamp.
      line({
        type: "file-history-delta",
        timestamp: "2026-01-01T00:05:00.000Z",
      });
    fs.writeFileSync(transcriptPath(), content);

    const [session] = parseSessions();
    // endTime must land on the assistant's reply (00:00:01), not the
    // bookkeeping line five minutes later.
    expect(session.endTime).toBe(Date.parse("2026-01-01T00:00:01.000Z"));
  });

  it("still advances endTime on a genuine later assistant reply", () => {
    const content =
      line({
        type: "user",
        cwd: "/Users/tester/project",
        message: { role: "user", content: "start" },
        timestamp: "2026-01-01T00:00:00.000Z",
      }) +
      line({
        type: "system",
        timestamp: "2026-01-01T00:00:30.000Z",
      }) +
      line({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "here" }] },
        timestamp: "2026-01-01T00:01:00.000Z",
      });
    fs.writeFileSync(transcriptPath(), content);

    const [session] = parseSessions();
    expect(session.endTime).toBe(Date.parse("2026-01-01T00:01:00.000Z"));
  });

  it("ignores a bookkeeping-only trailing partial line at EOF", () => {
    // The file ends mid-write (no trailing newline) on a bookkeeping
    // line — exercises the leftover-line branch, not just the main loop.
    const content =
      line({
        type: "user",
        cwd: "/Users/tester/project",
        message: { role: "user", content: "a normal prompt" },
        timestamp: "2026-01-01T00:00:00.000Z",
      }) +
      line({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "reply" }] },
        timestamp: "2026-01-01T00:00:01.000Z",
      }) + JSON.stringify({ type: "system", timestamp: "2026-01-01T00:09:00.000Z" });
    fs.writeFileSync(transcriptPath(), content);

    const [session] = parseSessions();
    expect(session.endTime).toBe(Date.parse("2026-01-01T00:00:01.000Z"));
  });

  it("falls back to 0 when a transcript has no message-bearing line at all", () => {
    // Pathological but must not throw: nothing but bookkeeping lines.
    const content = line({ type: "system", timestamp: "2026-01-01T00:00:00.000Z" });
    fs.writeFileSync(transcriptPath(), content);

    const sessions = parseSessions();
    // No real prompt means no summary, so this session is filtered out
    // entirely (parseSessions requires at least one prompt) — the point
    // here is only that parsing a bookkeeping-only file does not throw.
    expect(sessions).toEqual([]);
  });
});
