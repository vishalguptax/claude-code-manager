import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// vi.hoisted runs before vi.mock hoisting, so these are available in the factory
const { TEMP_DIR, STATE_FILE } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const dir = _path.join(_os.tmpdir(), ".claude-test-state");
  return {
    TEMP_DIR: dir,
    STATE_FILE: _path.join(dir, ".csm-state.json"),
  };
});

vi.mock("../../../core/config", () => ({
  STATE_FILE,
}));

import {
  loadState,
  saveState,
  pinSession,
  unpinSession,
  deleteSession,
  renameSession,
  pinSessions,
  unpinSessions,
  deleteSessions,
  archiveSession,
  unarchiveSession,
  archiveSessions,
  markSessionRead,
  markSessionUnread,
  isSessionUnread,
} from "../state";

const empty = () => ({
  pinned: [] as string[],
  deleted: [] as string[],
  renames: {} as Record<string, string>,
  archived: [] as string[],
  readAt: {} as Record<string, number>,
});

describe("loadState", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("returns default state when file does not exist", () => {
    const state = loadState();
    expect(state).toEqual(empty());
  });

  it("reads pinned and deleted arrays from file", () => {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ pinned: ["a", "b"], deleted: ["c"] }),
    );
    const state = loadState();
    expect(state.pinned).toEqual(["a", "b"]);
    expect(state.deleted).toEqual(["c"]);
    expect(state.renames).toEqual({});
  });

  it("reads renames map from file", () => {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ pinned: [], deleted: [], renames: { "sess-1": "my name" } }),
    );
    const state = loadState();
    expect(state.renames).toEqual({ "sess-1": "my name" });
  });

  it("returns default state when file contains invalid JSON", () => {
    fs.writeFileSync(STATE_FILE, "not json {{{");
    const state = loadState();
    expect(state).toEqual(empty());
  });

  it("handles missing pinned/deleted keys gracefully", () => {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ other: "stuff" }));
    const state = loadState();
    expect(state.pinned).toEqual([]);
    expect(state.deleted).toEqual([]);
    expect(state.renames).toEqual({});
  });

  it("handles null value in file", () => {
    fs.writeFileSync(STATE_FILE, "null");
    const state = loadState();
    expect(state).toEqual(empty());
  });
});

describe("saveState", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("writes state to disk as formatted JSON", () => {
    saveState({ pinned: ["x"], deleted: ["y"], renames: {} });
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const data = JSON.parse(raw);
    expect(data).toEqual({ pinned: ["x"], deleted: ["y"], renames: {} });
  });

  it("overwrites existing state file", () => {
    saveState({ pinned: ["old"], deleted: [], renames: {} });
    saveState({ pinned: ["new"], deleted: ["z"], renames: {} });
    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    expect(data.pinned).toEqual(["new"]);
  });
});

describe("pinSession", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("adds session to pinned list", () => {
    const state = pinSession("sess-1");
    expect(state.pinned).toContain("sess-1");
  });

  it("does not duplicate an already-pinned session", () => {
    pinSession("sess-1");
    const state = pinSession("sess-1");
    expect(state.pinned.filter((id) => id === "sess-1")).toHaveLength(1);
  });

  it("preserves existing pinned sessions", () => {
    saveState({ pinned: ["existing"], deleted: [], renames: {} });
    const state = pinSession("new-sess");
    expect(state.pinned).toContain("existing");
    expect(state.pinned).toContain("new-sess");
  });
});

describe("unpinSession", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("removes session from pinned list", () => {
    saveState({ pinned: ["a", "b", "c"], deleted: [], renames: {} });
    const state = unpinSession("b");
    expect(state.pinned).toEqual(["a", "c"]);
  });

  it("is a no-op if session was not pinned", () => {
    saveState({ pinned: ["a"], deleted: [], renames: {} });
    const state = unpinSession("nonexistent");
    expect(state.pinned).toEqual(["a"]);
  });
});

describe("deleteSession", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("adds session to deleted list", () => {
    const state = deleteSession("sess-del");
    expect(state.deleted).toContain("sess-del");
  });

  it("removes session from pinned list when deleting", () => {
    saveState({ pinned: ["sess-del", "other"], deleted: [], renames: {} });
    const state = deleteSession("sess-del");
    expect(state.pinned).not.toContain("sess-del");
    expect(state.pinned).toContain("other");
    expect(state.deleted).toContain("sess-del");
  });

  it("does not duplicate in deleted list", () => {
    deleteSession("sess-del");
    const state = deleteSession("sess-del");
    expect(state.deleted.filter((id) => id === "sess-del")).toHaveLength(1);
  });
});

describe("renameSession", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("stores the new name in renames map", () => {
    const state = renameSession("sess-1", "My Custom Name");
    expect(state.renames["sess-1"]).toBe("My Custom Name");
  });

  it("trims whitespace from the new name", () => {
    const state = renameSession("sess-1", "  spaced  ");
    expect(state.renames["sess-1"]).toBe("spaced");
  });

  it("clears the rename when given an empty string", () => {
    renameSession("sess-1", "temp");
    const state = renameSession("sess-1", "");
    expect(state.renames["sess-1"]).toBeUndefined();
  });

  it("persists across loadState calls", () => {
    renameSession("sess-1", "Persistent");
    const state = loadState();
    expect(state.renames["sess-1"]).toBe("Persistent");
  });
});

describe("bulk pin/unpin/delete", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("pinSessions adds every id once even when some are already pinned", () => {
    saveState({ pinned: ["a"], deleted: [], renames: {} });
    const state = pinSessions(["a", "b", "c"]);
    expect(state.pinned.sort()).toEqual(["a", "b", "c"]);
  });

  it("unpinSessions removes every id atomically", () => {
    saveState({ pinned: ["a", "b", "c", "d"], deleted: [], renames: {} });
    const state = unpinSessions(["a", "c"]);
    expect(state.pinned).toEqual(["b", "d"]);
  });

  it("deleteSessions adds to deleted + strips ids from pinned", () => {
    saveState({ pinned: ["a", "b"], deleted: ["x"], renames: {} });
    const state = deleteSessions(["a", "b"]);
    expect(state.deleted.sort()).toEqual(["a", "b", "x"]);
    expect(state.pinned).toEqual([]);
  });

  it("deleteSessions does not duplicate ids that were already deleted", () => {
    saveState({ pinned: [], deleted: ["a"], renames: {} });
    const state = deleteSessions(["a", "b"]);
    expect(state.deleted.sort()).toEqual(["a", "b"]);
  });
});


describe("archive", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("archives a session and persists it", () => {
    archiveSession("s-1");
    expect(loadState().archived).toEqual(["s-1"]);
  });

  it("is a no-op when the session is already archived", () => {
    archiveSession("s-1");
    archiveSession("s-1");
    expect(loadState().archived).toEqual(["s-1"]);
  });

  it("unpins on archive, because pinned-to-the-top of a list it is excluded from is incoherent", () => {
    pinSession("s-1");
    archiveSession("s-1");
    const state = loadState();
    expect(state.archived).toEqual(["s-1"]);
    expect(state.pinned).toEqual([]);
  });

  it("restores an archived session", () => {
    archiveSession("s-1");
    unarchiveSession("s-1");
    expect(loadState().archived).toEqual([]);
  });

  it("is a no-op when unarchiving something never archived", () => {
    unarchiveSession("nope");
    expect(loadState().archived).toEqual([]);
  });

  it("archives many in one write, skipping duplicates", () => {
    archiveSession("s-1");
    archiveSessions(["s-1", "s-2", "s-3"]);
    expect(loadState().archived).toEqual(["s-1", "s-2", "s-3"]);
  });

  it("bulk archive unpins every session it archives", () => {
    pinSessions(["s-1", "s-2"]);
    archiveSessions(["s-1", "s-2"]);
    const state = loadState();
    expect(state.pinned).toEqual([]);
    expect(state.archived).toEqual(["s-1", "s-2"]);
  });

  it("reads an archived list written by a previous run", () => {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ archived: ["old"] }));
    expect(loadState().archived).toEqual(["old"]);
  });

  it("defaults archived to empty for state files predating the field", () => {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ pinned: ["a"], deleted: [] }));
    const state = loadState();
    expect(state.archived).toEqual([]);
    expect(state.pinned).toEqual(["a"]);
  });
});

describe("read marks", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("records a read mark", () => {
    markSessionRead("s-1", 1000);
    expect(loadState().readAt["s-1"]).toBe(1000);
  });

  it("moves the mark forward", () => {
    markSessionRead("s-1", 1000);
    markSessionRead("s-1", 2000);
    expect(loadState().readAt["s-1"]).toBe(2000);
  });

  it("never rewinds the mark behind activity already seen", () => {
    markSessionRead("s-1", 2000);
    markSessionRead("s-1", 1000);
    expect(loadState().readAt["s-1"]).toBe(2000);
  });

  it("ignores a non-finite timestamp rather than poisoning the mark", () => {
    markSessionRead("s-1", Number.NaN);
    expect(loadState().readAt["s-1"]).toBeUndefined();
  });

  it("marking unread drops the entry entirely", () => {
    markSessionRead("s-1", 1000);
    markSessionUnread("s-1");
    expect("s-1" in loadState().readAt).toBe(false);
  });

  it("marking unread is a no-op when there is no mark", () => {
    markSessionUnread("s-1");
    expect(loadState().readAt).toEqual({});
  });

  it("drops non-numeric marks from a corrupt state file", () => {
    // A non-finite mark would compare false against every activity time,
    // silently pinning the session to "read" forever.
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ readAt: { good: 5, bad: "nope", worse: null } }),
    );
    expect(loadState().readAt).toEqual({ good: 5 });
  });

  it("treats a never-opened session as unread", () => {
    expect(isSessionUnread(empty(), "s-1", 1000)).toBe(true);
  });

  it("is unread when activity is newer than the mark", () => {
    const state = { ...empty(), readAt: { "s-1": 1000 } };
    expect(isSessionUnread(state, "s-1", 2000)).toBe(true);
  });

  it("is read when activity is older than or equal to the mark", () => {
    const state = { ...empty(), readAt: { "s-1": 2000 } };
    expect(isSessionUnread(state, "s-1", 1000)).toBe(false);
    expect(isSessionUnread(state, "s-1", 2000)).toBe(false);
  });
});
