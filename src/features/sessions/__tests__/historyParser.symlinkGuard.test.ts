/**
 * Symlink guard for orphan-session discovery.
 *
 * `discoverOrphanSessions` walks ~/.claude/projects/ and streams every
 * transcript that history.jsonl does not already know about — the widest
 * untrusted read in the extension. A symlinked `<uuid>.jsonl` planted there
 * must yield no orphan data at all, so the session is skipped and the link
 * target's prompt text never reaches the webview.
 *
 * Real symlinks, not the fs mock — link semantics are the subject here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { CLAUDE_DIR, HISTORY_FILE, PROJECTS_DIR, SESSIONS_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const dir = _path.join(_os.tmpdir(), ".claude-test-history-symlink");
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
/** The prompt text an attacker wants surfaced in the session list. */
const SECRET_PROMPT = "SUPER_SECRET_TOKEN";

function transcript(prompt: string): string {
  return (
    [
      JSON.stringify({
        type: "user",
        cwd: "/Users/tester/project",
        gitBranch: "main",
        userType: "external",
        message: { role: "user", content: prompt },
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
        timestamp: "2026-01-01T00:00:01.000Z",
      }),
    ].join("\n") + "\n"
  );
}

/** Absolute path of the transcript slot inside the fake projects tree. */
function transcriptPath(): string {
  return path.join(PROJECTS_DIR, PROJECT_SLUG, `${SESSION_ID}.jsonl`);
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

describe("orphan session discovery", () => {
  it("still discovers a regular transcript", () => {
    fs.writeFileSync(transcriptPath(), transcript("a normal prompt"));

    const sessions = parseSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(SESSION_ID);
    expect(sessions[0].summary).toBe("a normal prompt");
  });

  it("skips a symlinked transcript and never surfaces the target's prompt", () => {
    const target = path.join(CLAUDE_DIR, "outside-the-tree.jsonl");
    fs.writeFileSync(target, transcript(SECRET_PROMPT));
    fs.symlinkSync(target, transcriptPath());

    const sessions = parseSessions();
    expect(sessions).toEqual([]);
    expect(JSON.stringify(sessions)).not.toContain(SECRET_PROMPT);
  });

  it("skips a dangling symlink without failing the whole parse", () => {
    fs.symlinkSync(path.join(CLAUDE_DIR, "gone.jsonl"), transcriptPath());
    // A second, regular transcript proves the parse continues past the link.
    const otherId = "99999999-8888-7777-6666-555555555555";
    fs.writeFileSync(
      path.join(PROJECTS_DIR, PROJECT_SLUG, `${otherId}.jsonl`),
      transcript("survivor"),
    );

    const sessions = parseSessions();
    expect(sessions.map((s) => s.id)).toEqual([otherId]);
  });
});
