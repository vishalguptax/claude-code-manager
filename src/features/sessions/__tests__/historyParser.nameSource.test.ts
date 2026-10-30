/**
 * `nameSource` contract: a session's name is flagged as the CLI's own title
 * only when it resolved from the transcript's `custom-title` or `ai-title`
 * entries — the titles `claude` also writes to its terminal. A resumed
 * session's tab is left to follow that title only when this holds.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { CLAUDE_DIR, HISTORY_FILE, PROJECTS_DIR, SESSIONS_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const dir = _path.join(_os.tmpdir(), ".claude-test-history-namesource");
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

import { parseSessions, clearOrphanCache, cliNameSourceField } from "../historyParser";
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

const user = line({
  type: "user",
  cwd: "/Users/tester/project",
  message: { role: "user", content: "rewrite the parser" },
  timestamp: "2026-01-01T00:00:00.000Z",
});

describe("session nameSource", () => {
  it("marks a name taken from the CLI's ai-title", () => {
    fs.writeFileSync(
      transcriptPath(),
      user + line({ type: "ai-title", aiTitle: "Parser rewrite", sessionId: SESSION_ID }),
    );
    const [session] = parseSessions();
    expect(session.name).toBe("Parser rewrite");
    expect(session.nameSource).toBe("ai-title");
  });

  it("marks a name taken from the CLI's custom title, which outranks the ai-title", () => {
    fs.writeFileSync(
      transcriptPath(),
      user +
        line({ type: "ai-title", aiTitle: "Parser rewrite", sessionId: SESSION_ID }) +
        line({ type: "custom-title", customTitle: "My parser", sessionId: SESSION_ID }),
    );
    const [session] = parseSessions();
    expect(session.name).toBe("My parser");
    expect(session.nameSource).toBe("custom-title");
  });

  it("leaves it absent when an extension rename wins", () => {
    fs.writeFileSync(
      transcriptPath(),
      user + line({ type: "ai-title", aiTitle: "Parser rewrite", sessionId: SESSION_ID }),
    );
    const [session] = parseSessions({ [SESSION_ID]: "Mine" });
    expect(session.name).toBe("Mine");
    expect(session.nameSource).toBeUndefined();
  });

  it("leaves it absent for a name from the first prompt", () => {
    fs.writeFileSync(transcriptPath(), user);
    const [session] = parseSessions();
    expect(session.name).toBe("rewrite the parser");
    expect(session.nameSource).toBeUndefined();
  });
});

describe("cliNameSourceField", () => {
  it("ranks a transcript /rename above the ai-title, which the CLI does not", () => {
    expect(cliNameSourceField(undefined, "", "/rename name", "Parser rewrite")).toEqual({});
  });
});
