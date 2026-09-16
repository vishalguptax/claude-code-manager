/**
 * Symlink guard for the pending-question tail probe.
 *
 * `refineStatus` tail-reads the transcript that `getSessionFile` resolves out
 * of ~/.claude/projects/. That path is attacker-influenceable, so a symlinked
 * transcript must degrade to "no pending question" (base status passes
 * through) rather than reading whatever the link points at.
 *
 * Real symlinks, not the fs mock — link semantics are the subject here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { SESSIONS_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { SESSIONS_DIR: _path.join(_os.tmpdir(), ".claude-test-live-symlink") };
});

vi.mock("../../../core/config", () => ({ SESSIONS_DIR }));

// The transcript path refineStatus will probe. Swapped per test.
let sessionFile: string | null = null;
vi.mock("../metaParser", () => ({ getSessionFile: () => sessionFile }));

import { refineStatus, AWAITING_QUESTION_STATUS, clearPendingCache } from "../liveSessions";

let tmp: string;

/** A transcript whose last message is an unanswered AskUserQuestion. */
const PENDING_TRANSCRIPT =
  JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_01", name: "AskUserQuestion", input: {} }],
    },
  }) + "\n";

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csm-live-symlink-"));
  clearPendingCache();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  sessionFile = null;
  clearPendingCache();
});

describe("refineStatus transcript reads", () => {
  it("still detects a pending question in a regular transcript", () => {
    sessionFile = path.join(tmp, "real.jsonl");
    fs.writeFileSync(sessionFile, PENDING_TRANSCRIPT);

    expect(refineStatus("s1", "idle")).toBe(AWAITING_QUESTION_STATUS);
  });

  it("ignores a symlinked transcript and passes the base status through", () => {
    const target = path.join(tmp, "outside.jsonl");
    fs.writeFileSync(target, PENDING_TRANSCRIPT);
    sessionFile = path.join(tmp, "linked.jsonl");
    fs.symlinkSync(target, sessionFile);

    // The target *would* report a pending question if we followed the link.
    expect(refineStatus("s2", "idle")).toBe("idle");
    expect(refineStatus("s2", undefined)).toBeUndefined();
  });

  it("does not throw on a dangling symlink or a directory", () => {
    sessionFile = path.join(tmp, "dangling.jsonl");
    fs.symlinkSync(path.join(tmp, "gone.jsonl"), sessionFile);
    expect(refineStatus("s3", "busy")).toBe("busy");

    sessionFile = path.join(tmp, "dir.jsonl");
    fs.mkdirSync(sessionFile);
    expect(refineStatus("s4", "busy")).toBe("busy");
  });
});
