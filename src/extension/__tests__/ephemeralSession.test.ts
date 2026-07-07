import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";
import * as fs from "fs";

const { CLAUDE_DIR, HISTORY_FILE, PROJECTS_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const dir = _path.join(_os.tmpdir(), ".claude-test-ephemeral");
  return {
    CLAUDE_DIR: dir,
    HISTORY_FILE: _path.join(dir, "history.jsonl"),
    PROJECTS_DIR: _path.join(dir, "projects"),
  };
});

vi.mock("../../core/config", () => ({
  HISTORY_FILE,
  PROJECTS_DIR,
}));

import {
  findEphemeralSessions,
  stripHistoryLines,
  cleanupEphemeral,
  setEphemeralStorage,
  sweepOrphans,
  getTempSessionIds,
  promoteTempSession,
} from "../ephemeralSession";
import { slugifyProjectPath } from "../../features/sessions/portable";

const PROJECT = "/home/user/my-project";
const SLUG = slugifyProjectPath(PROJECT);

function setup() {
  fs.rmSync(CLAUDE_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(PROJECTS_DIR, SLUG), { recursive: true });
}

function writeSession(id: string, mtimeOffsetMs = 0): void {
  const file = path.join(PROJECTS_DIR, SLUG, `${id}.jsonl`);
  fs.writeFileSync(file, "{}\n");
  if (mtimeOffsetMs) {
    const t = (Date.now() + mtimeOffsetMs) / 1000;
    fs.utimesSync(file, t, t);
  }
}

function writeHistory(entries: Array<{ sessionId: string; display: string }>): void {
  const lines = entries
    .map((e) => JSON.stringify({ ...e, timestamp: Date.now(), project: PROJECT }))
    .join("\n");
  fs.writeFileSync(HISTORY_FILE, lines + "\n");
}

describe("findEphemeralSessions", () => {
  beforeEach(setup);

  it("returns ids absent from the snapshot", () => {
    writeSession("old-1");
    writeSession("new-a");
    writeSession("new-b");
    const found = findEphemeralSessions(SLUG, ["old-1"], Date.now() - 10_000);
    expect(found.sort()).toEqual(["new-a", "new-b"]);
  });

  it("ignores files older than startedAt", () => {
    writeSession("ancient", -60_000); // 60s before launch
    writeSession("fresh");
    const startedAt = Date.now() - 5_000;
    const found = findEphemeralSessions(SLUG, [], startedAt);
    expect(found).toEqual(["fresh"]);
  });

  it("returns empty when slug dir does not exist", () => {
    expect(findEphemeralSessions("nope--slug", [], 0)).toEqual([]);
  });
});

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
    const remaining = fs
      .readFileSync(HISTORY_FILE, "utf-8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).sessionId);
    expect(remaining).toEqual(["keep-1", "keep-2"]);
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

  it("deletes new JSONL files and strips history for them", () => {
    writeSession("pre-existing");
    writeSession("temp-a");
    writeSession("temp-b");
    writeHistory([
      { sessionId: "pre-existing", display: "old" },
      { sessionId: "temp-a", display: "tempA" },
      { sessionId: "temp-b", display: "tempB" },
    ]);

    cleanupEphemeral({
      slug: SLUG,
      startedAt: Date.now() - 10_000,
      snapshotIds: ["pre-existing"],
    });

    expect(fs.existsSync(path.join(PROJECTS_DIR, SLUG, "pre-existing.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(PROJECTS_DIR, SLUG, "temp-a.jsonl"))).toBe(false);
    expect(fs.existsSync(path.join(PROJECTS_DIR, SLUG, "temp-b.jsonl"))).toBe(false);

    const ids = fs
      .readFileSync(HISTORY_FILE, "utf-8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).sessionId);
    expect(ids).toEqual(["pre-existing"]);
  });
});

/** Wire a fresh in-memory globalState seeded with the given pending entries. */
function setPending(entries: unknown[]): Map<string, unknown> {
  const store = new Map<string, unknown>();
  store.set("claudeManager.pendingTempSessions", entries);
  setEphemeralStorage({
    get: (k: string, d?: unknown) => (store.has(k) ? store.get(k) : d),
    update: async (k: string, v: unknown) => {
      store.set(k, v);
    },
    keys: () => Array.from(store.keys()),
  } as unknown as Parameters<typeof setEphemeralStorage>[0]);
  return store;
}

describe("getTempSessionIds", () => {
  beforeEach(setup);

  it("returns new (post-snapshot) ids across pending entries, excluding promoted", () => {
    writeSession("pre");
    writeSession("temp-a");
    writeSession("temp-b");
    setPending([
      {
        slug: SLUG,
        startedAt: Date.now() - 10_000,
        snapshotIds: ["pre"],
        promotedIds: ["temp-b"],
      },
    ]);

    expect(getTempSessionIds().sort()).toEqual(["temp-a"]);
  });

  it("is empty when nothing is pending", () => {
    setPending([]);
    expect(getTempSessionIds()).toEqual([]);
  });
});

describe("promoteTempSession", () => {
  beforeEach(setup);

  it("keeps a promoted session out of both the temp set and cleanup", () => {
    writeSession("pre");
    writeSession("keep-me");
    writeSession("toss-me");
    writeHistory([
      { sessionId: "pre", display: "old" },
      { sessionId: "keep-me", display: "keep" },
      { sessionId: "toss-me", display: "toss" },
    ]);
    setPending([{ slug: SLUG, startedAt: Date.now() - 10_000, snapshotIds: ["pre"] }]);

    expect(promoteTempSession("keep-me")).toBe(true);
    // No longer badged as temp.
    expect(getTempSessionIds().sort()).toEqual(["toss-me"]);

    // Close-time cleanup must spare the promoted session, delete the rest.
    cleanupEphemeral({
      slug: SLUG,
      startedAt: Date.now() - 10_000,
      snapshotIds: ["pre"],
      promotedIds: ["keep-me"],
    });
    expect(fs.existsSync(path.join(PROJECTS_DIR, SLUG, "keep-me.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(PROJECTS_DIR, SLUG, "toss-me.jsonl"))).toBe(false);
    const ids = fs
      .readFileSync(HISTORY_FILE, "utf-8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).sessionId)
      .sort();
    expect(ids).toEqual(["keep-me", "pre"]);
  });

  it("returns false for an unknown id", () => {
    writeSession("pre");
    setPending([{ slug: SLUG, startedAt: Date.now() - 10_000, snapshotIds: ["pre"] }]);
    expect(promoteTempSession("nope")).toBe(false);
  });
});

describe("sweepOrphans", () => {
  beforeEach(setup);

  it("drains every pending entry and clears storage", () => {
    writeSession("a");
    writeSession("b");
    writeHistory([
      { sessionId: "a", display: "x" },
      { sessionId: "b", display: "y" },
    ]);

    const store = new Map<string, unknown>();
    store.set("claudeManager.pendingTempSessions", [
      { slug: SLUG, startedAt: Date.now() - 10_000, snapshotIds: [] },
    ]);
    setEphemeralStorage({
      get: (k: string, d?: unknown) => (store.has(k) ? store.get(k) : d),
      update: async (k: string, v: unknown) => {
        store.set(k, v);
      },
      keys: () => Array.from(store.keys()),
    } as unknown as Parameters<typeof setEphemeralStorage>[0]);

    sweepOrphans();

    expect(fs.existsSync(path.join(PROJECTS_DIR, SLUG, "a.jsonl"))).toBe(false);
    expect(fs.existsSync(path.join(PROJECTS_DIR, SLUG, "b.jsonl"))).toBe(false);
    expect(store.get("claudeManager.pendingTempSessions")).toEqual([]);
  });
});
