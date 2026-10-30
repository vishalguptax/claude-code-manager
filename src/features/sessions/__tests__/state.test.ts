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
  pinSessions,
  unpinSessions,
  deleteSessions,
  archiveSession,
  unarchiveSession,
  archiveSessions,
  setSessionsFolder,
  createFolder,
  renameFolder,
  removeFolder,
} from "../state";

const empty = () => ({
  pinned: [] as string[],
  deleted: [] as string[],
  renames: {} as Record<string, string>,
  archived: [] as string[],
  folders: {} as Record<string, string>,
  folderNames: [] as string[],
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

  it("replaces the file by rename, never truncating it in place", () => {
    saveState({ pinned: ["old"], deleted: [], renames: {} });
    const before = fs.statSync(STATE_FILE).ino;
    saveState({ pinned: ["new"], deleted: [], renames: {} });
    // A fresh inode proves rename-over: a truncate-then-write in place is what
    // another window could read as empty JSON and then save back over every pin.
    expect(fs.statSync(STATE_FILE).ino).not.toBe(before);
    expect(JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")).pinned).toEqual(["new"]);
    expect(fs.readdirSync(TEMP_DIR)).toEqual([path.basename(STATE_FILE)]);
  });

  it("warns and leaves no temp file when the directory is missing", () => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      saveState({ pinned: ["x"], deleted: [], renames: {} });
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
    expect(fs.existsSync(TEMP_DIR)).toBe(false);
  });
});

describe("cross-window writes", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("keeps a pin another window wrote since this window's last mutation", () => {
    pinSession("ours-1");
    // Another window pins + renames through the same file.
    const other = loadState();
    other.pinned.push("theirs");
    other.renames.theirs = "Their name";
    fs.writeFileSync(STATE_FILE, JSON.stringify(other));

    pinSession("ours-2");
    archiveSession("archived-here");

    const state = loadState();
    expect(state.pinned).toEqual(["ours-1", "theirs", "ours-2"]);
    expect(state.renames).toEqual({ theirs: "Their name" });
    expect(state.archived).toEqual(["archived-here"]);
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

describe("folders", () => {
  beforeEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  it("defaults to no folders for state files predating the field", () => {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ pinned: ["a"] }));
    expect(loadState().folders).toEqual({});
  });

  it("lists folders found in the map even when the list predates them", () => {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ folders: { a: "auth", b: "auth" } }));
    expect(loadState().folderNames).toEqual(["auth"]);
  });

  it("creates an empty folder once, ignoring blanks", () => {
    createFolder("  later ");
    createFolder("later");
    createFolder("   ");
    const state = loadState();
    expect(state.folderNames).toEqual(["later"]);
    expect(state.folders).toEqual({});
  });

  it("keeps a folder after its last session leaves", () => {
    setSessionsFolder(["s-1"], "auth");
    setSessionsFolder(["s-1"], "");
    expect(loadState().folderNames).toEqual(["auth"]);
  });

  it("renames an empty folder, and merges a rename onto an existing one", () => {
    createFolder("later");
    createFolder("release");
    renameFolder("later", "soon");
    expect(loadState().folderNames.sort()).toEqual(["release", "soon"]);
    renameFolder("soon", "release");
    expect(loadState().folderNames).toEqual(["release"]);
  });

  it("removes an empty folder from the list", () => {
    createFolder("later");
    removeFolder("later");
    expect(loadState().folderNames).toEqual([]);
  });

  it("drops non-string entries from a hand-edited folders map", () => {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ folders: { a: "auth", b: 7, c: null } }));
    expect(loadState().folders).toEqual({ a: "auth" });
  });

  it("files sessions under a trimmed name and persists it", () => {
    setSessionsFolder(["s-1", "s-2"], "  auth refactor ");
    expect(loadState().folders).toEqual({ "s-1": "auth refactor", "s-2": "auth refactor" });
  });

  it("moves a session from one folder to another", () => {
    setSessionsFolder(["s-1"], "auth");
    setSessionsFolder(["s-1"], "release");
    expect(loadState().folders).toEqual({ "s-1": "release" });
  });

  it("unfiles sessions when the folder name is blank", () => {
    setSessionsFolder(["s-1", "s-2"], "auth");
    setSessionsFolder(["s-1"], "   ");
    expect(loadState().folders).toEqual({ "s-2": "auth" });
  });

  it("renames a folder by re-filing every session in it, leaving others alone", () => {
    setSessionsFolder(["s-1", "s-2"], "auth");
    setSessionsFolder(["s-3"], "release");
    renameFolder("auth", " login ");
    expect(loadState().folders).toEqual({ "s-1": "login", "s-2": "login", "s-3": "release" });
  });

  it("merges folders when renamed onto an existing name", () => {
    setSessionsFolder(["s-1"], "auth");
    setSessionsFolder(["s-2"], "release");
    renameFolder("auth", "release");
    expect(loadState().folders).toEqual({ "s-1": "release", "s-2": "release" });
  });

  it("ignores a blank rename", () => {
    setSessionsFolder(["s-1"], "auth");
    renameFolder("auth", "  ");
    expect(loadState().folders).toEqual({ "s-1": "auth" });
  });

  it("removes a folder without touching the sessions' other state", () => {
    pinSession("s-1");
    setSessionsFolder(["s-1", "s-2"], "auth");
    setSessionsFolder(["s-3"], "release");
    removeFolder("auth");
    const state = loadState();
    expect(state.folders).toEqual({ "s-3": "release" });
    expect(state.pinned).toEqual(["s-1"]);
  });

  it("deleting a session unfiles it", () => {
    setSessionsFolder(["s-1", "s-2", "s-3"], "auth");
    deleteSession("s-1");
    deleteSessions(["s-2"]);
    expect(loadState().folders).toEqual({ "s-3": "auth" });
  });
});
