import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";
import * as fs from "fs";
import { _fireTerminalClose } from "../../../__mocks__/vscode";

const { CLAUDE_DIR, HISTORY_FILE, PROJECTS_DIR, SESSIONS_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const dir = _path.join(_os.tmpdir(), ".claude-test-ephemeral");
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

import {
  stripHistoryLines,
  cleanupEphemeral,
  setEphemeralStorage,
  sweepOrphans,
  getTempSessionIds,
  promoteTempSession,
  registerEphemeralTerminal,
} from "../ephemeralSession";
import { slugifyProjectPath } from "../portable";

const PROJECT = "/home/user/my-project";
const SLUG = slugifyProjectPath(PROJECT);
const KEY = "claudeManager.pendingTempSessions";

/** A PID guaranteed not to name a running process on any test host. */
const DEAD_PID = 2 ** 22 + 12345;

function setup() {
  fs.rmSync(CLAUDE_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(PROJECTS_DIR, SLUG), { recursive: true });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionFile(id: string): string {
  return path.join(PROJECTS_DIR, SLUG, `${id}.jsonl`);
}

function writeSession(id: string): void {
  fs.writeFileSync(sessionFile(id), "{}\n");
}

/** Mark `id` as running the way the CLI does: a PID file naming a live process. */
function markLive(id: string): void {
  fs.writeFileSync(
    path.join(SESSIONS_DIR, `${process.pid}.json`),
    JSON.stringify({ pid: process.pid, sessionId: id, status: "busy", updatedAt: Date.now() }),
  );
}

function writeHistory(entries: Array<{ sessionId: string; display: string }>): void {
  const lines = entries
    .map((e) => JSON.stringify({ ...e, timestamp: Date.now(), project: PROJECT }))
    .join("\n");
  fs.writeFileSync(HISTORY_FILE, lines + "\n");
}

function historyIds(): string[] {
  return fs
    .readFileSync(HISTORY_FILE, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).sessionId)
    .sort();
}

/** Wire a fresh in-memory globalState seeded with the given pending entries. */
function setPending(entries: unknown[]): Map<string, unknown> {
  const store = new Map<string, unknown>();
  store.set(KEY, entries);
  setEphemeralStorage({
    get: (k: string, d?: unknown) => (store.has(k) ? store.get(k) : d),
    update: async (k: string, v: unknown) => {
      store.set(k, v);
    },
    keys: () => Array.from(store.keys()),
  } as unknown as Parameters<typeof setEphemeralStorage>[0]);
  return store;
}

describe("stripHistoryLines", () => {
  beforeEach(setup);

  it("removes matching session lines and keeps the rest", () => {
    writeHistory([
      { sessionId: "keep-1", display: "a" },
      { sessionId: "drop-1", display: "b" },
      { sessionId: "keep-2", display: "c" },
      { sessionId: "drop-2", display: "d" },
    ]);
    stripHistoryLines(["drop-1", "drop-2"]);
    expect(historyIds()).toEqual(["keep-1", "keep-2"]);
    expect(fs.existsSync(HISTORY_FILE + ".csm-tmp")).toBe(false);
  });

  it("preserves malformed lines untouched", () => {
    fs.writeFileSync(
      HISTORY_FILE,
      `{"sessionId":"drop-1","display":"a"}\nnot-json\n{"sessionId":"keep","display":"b"}\n`,
    );
    stripHistoryLines(["drop-1"]);
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    expect(raw).toContain("not-json");
    expect(raw).toContain("keep");
    expect(raw).not.toContain("drop-1");
  });

  it("is a no-op when history.jsonl is missing", () => {
    fs.rmSync(HISTORY_FILE, { force: true });
    expect(() => stripHistoryLines(["x"])).not.toThrow();
  });

  it("is a no-op for empty id list even if history exists", () => {
    writeHistory([{ sessionId: "x", display: "a" }]);
    const before = fs.readFileSync(HISTORY_FILE, "utf-8");
    stripHistoryLines([]);
    expect(fs.readFileSync(HISTORY_FILE, "utf-8")).toBe(before);
  });
});

describe("cleanupEphemeral", () => {
  beforeEach(setup);

  it("deletes only the owned ids, sparing sessions that started alongside it", () => {
    writeSession("pre-existing");
    writeSession("temp-a");
    // Started in another terminal of the same project after the temp launch —
    // the old directory diff deleted this one too.
    writeSession("concurrent-real");
    writeHistory([
      { sessionId: "pre-existing", display: "old" },
      { sessionId: "temp-a", display: "tempA" },
      { sessionId: "concurrent-real", display: "real" },
    ]);

    const deferred = cleanupEphemeral({
      slug: SLUG,
      startedAt: Date.now() - 10_000,
      sessionIds: ["temp-a"],
    });

    expect(deferred).toEqual([]);
    expect(fs.existsSync(sessionFile("temp-a"))).toBe(false);
    expect(fs.existsSync(sessionFile("pre-existing"))).toBe(true);
    expect(fs.existsSync(sessionFile("concurrent-real"))).toBe(true);
    expect(historyIds()).toEqual(["concurrent-real", "pre-existing"]);
  });

  it("never deletes a session the CLI reports as running, and returns it", () => {
    writeSession("still-running");
    writeHistory([{ sessionId: "still-running", display: "x" }]);
    markLive("still-running");

    const deferred = cleanupEphemeral({ slug: SLUG, startedAt: 0, sessionIds: ["still-running"] });

    expect(deferred).toEqual(["still-running"]);
    expect(fs.existsSync(sessionFile("still-running"))).toBe(true);
    expect(historyIds()).toEqual(["still-running"]);
  });
});

describe("getTempSessionIds", () => {
  beforeEach(setup);

  it("returns owned ids across pending entries, excluding promoted", () => {
    setPending([
      { slug: SLUG, startedAt: 1, sessionIds: ["temp-a", "temp-b"], promotedIds: ["temp-b"] },
      { slug: SLUG, startedAt: 2, sessionIds: ["temp-c"] },
    ]);
    expect(getTempSessionIds().sort()).toEqual(["temp-a", "temp-c"]);
  });

  it("ignores legacy snapshot-only entries", () => {
    writeSession("new-since-snapshot");
    setPending([{ slug: SLUG, startedAt: 0, snapshotIds: [] }]);
    expect(getTempSessionIds()).toEqual([]);
  });

  it("is empty when nothing is pending", () => {
    setPending([]);
    expect(getTempSessionIds()).toEqual([]);
  });
});

describe("promoteTempSession", () => {
  beforeEach(setup);

  it("keeps a promoted session out of both the temp set and cleanup", () => {
    writeSession("keep-me");
    writeSession("toss-me");
    writeHistory([
      { sessionId: "keep-me", display: "keep" },
      { sessionId: "toss-me", display: "toss" },
    ]);
    const store = setPending([{ slug: SLUG, startedAt: 1, sessionIds: ["keep-me", "toss-me"] }]);

    expect(promoteTempSession("keep-me")).toBe(true);
    expect(getTempSessionIds()).toEqual(["toss-me"]);

    const [entry] = store.get(KEY) as Parameters<typeof cleanupEphemeral>[0][];
    cleanupEphemeral(entry);
    expect(fs.existsSync(sessionFile("keep-me"))).toBe(true);
    expect(fs.existsSync(sessionFile("toss-me"))).toBe(false);
    expect(historyIds()).toEqual(["keep-me"]);
  });

  it("returns false for an unknown id", () => {
    setPending([{ slug: SLUG, startedAt: 1, sessionIds: ["temp"] }]);
    expect(promoteTempSession("nope")).toBe(false);
  });
});

describe("registerEphemeralTerminal", () => {
  beforeEach(setup);

  it("records an owned, exact-id entry and deletes only that id on close", () => {
    const store = setPending([]);
    const term = {};
    const onCleaned = vi.fn();
    const { sessionId } = registerEphemeralTerminal(
      term as Parameters<typeof registerEphemeralTerminal>[0],
      PROJECT,
      onCleaned,
    );

    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.get(KEY)).toEqual([
      expect.objectContaining({ slug: SLUG, sessionIds: [sessionId], ownerPid: process.pid }),
    ]);

    writeSession(sessionId);
    writeSession("other-window-session");
    _fireTerminalClose({}); // a different terminal closing is ignored
    expect(fs.existsSync(sessionFile(sessionId))).toBe(true);

    _fireTerminalClose(term);
    expect(fs.existsSync(sessionFile(sessionId))).toBe(false);
    expect(fs.existsSync(sessionFile("other-window-session"))).toBe(true);
    expect(store.get(KEY)).toEqual([]);
    expect(onCleaned).toHaveBeenCalledOnce();
  });

  it("hands a still-running session to the next sweep instead of dropping it", () => {
    const store = setPending([]);
    const term = {};
    const { sessionId } = registerEphemeralTerminal(
      term as Parameters<typeof registerEphemeralTerminal>[0],
      PROJECT,
    );
    writeSession(sessionId);
    markLive(sessionId);

    _fireTerminalClose(term);

    expect(fs.existsSync(sessionFile(sessionId))).toBe(true);
    const [left] = store.get(KEY) as Array<Record<string, unknown>>;
    expect(left.sessionIds).toEqual([sessionId]);
    expect(left.ownerPid).toBeUndefined();
  });
});

describe("sweepOrphans", () => {
  beforeEach(setup);

  it("cleans entries whose owning extension host is gone", () => {
    writeSession("orphan");
    writeHistory([{ sessionId: "orphan", display: "x" }]);
    const store = setPending([
      { slug: SLUG, startedAt: 1, sessionIds: ["orphan"], ownerPid: DEAD_PID },
    ]);

    sweepOrphans();

    expect(fs.existsSync(sessionFile("orphan"))).toBe(false);
    expect(historyIds()).toEqual([]);
    expect(store.get(KEY)).toEqual([]);
  });

  it("leaves entries owned by a running host (another window) untouched", () => {
    writeSession("other-window-temp");
    const live = { slug: SLUG, startedAt: 1, sessionIds: ["other-window-temp"], ownerPid: process.pid };
    const store = setPending([live]);

    sweepOrphans();

    expect(fs.existsSync(sessionFile("other-window-temp"))).toBe(true);
    expect(store.get(KEY)).toEqual([live]);
  });

  it("keeps an orphaned entry pending while its session is still running", () => {
    writeSession("restored");
    markLive("restored");
    const store = setPending([{ slug: SLUG, startedAt: 1, sessionIds: ["restored"] }]);

    sweepOrphans();

    expect(fs.existsSync(sessionFile("restored"))).toBe(true);
    expect(store.get(KEY)).toEqual([
      expect.objectContaining({ sessionIds: ["restored"], ownerPid: undefined }),
    ]);
  });

  it("drops legacy snapshot-only entries without deleting anything", () => {
    writeSession("unrelated-new-session");
    const store = setPending([{ slug: SLUG, startedAt: 0, snapshotIds: [] }]);

    sweepOrphans();

    expect(fs.existsSync(sessionFile("unrelated-new-session"))).toBe(true);
    expect(store.get(KEY)).toEqual([]);
  });
});
