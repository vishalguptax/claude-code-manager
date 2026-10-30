import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const dirs = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-renames");
  return {
    ROOT: root,
    STATE_FILE: _path.join(root, ".csm-state.json"),
    PENDING_RENAMES_DIR: _path.join(root, "pending-renames"),
  };
});

vi.mock("../../../core/config", () => ({
  STATE_FILE: dirs.STATE_FILE,
  PENDING_RENAMES_DIR: dirs.PENDING_RENAMES_DIR,
}));

import {
  applyRename,
  loadRenames,
  movePendingToRenames,
  moveRenamesToPending,
} from "../renames";
import { loadState, saveState } from "../state";
import { readPendingRenames, setPendingRename } from "../pendingRenames";

function stateWithRenames(renames: Record<string, string>): void {
  saveState({ ...loadState(), renames });
}

beforeEach(() => {
  fs.rmSync(dirs.ROOT, { recursive: true, force: true });
  fs.mkdirSync(dirs.ROOT, { recursive: true });
});

describe("applyRename — sidebar only", () => {
  it("stores the trimmed name in the state file", () => {
    applyRename("sess-1", "  My name  ", false);
    expect(loadState().renames["sess-1"]).toBe("My name");
    expect(readPendingRenames()).toEqual({});
  });

  it("clears the rename when given an empty name", () => {
    applyRename("sess-1", "temp", false);
    applyRename("sess-1", "", false);
    expect(loadState().renames["sess-1"]).toBeUndefined();
  });

  it("drops a pending rename so the old name cannot reach Claude Code later", () => {
    setPendingRename("sess-1", "Pending");
    applyRename("sess-1", "Sidebar", false);
    expect(readPendingRenames()).toEqual({});
  });
});

describe("applyRename — in Claude Code", () => {
  it("parks the name for the hook and keeps it out of the state file", () => {
    applyRename("sess-1", "  Parser rewrite ", true);
    expect(readPendingRenames()).toEqual({ "sess-1": "Parser rewrite" });
    expect(loadState().renames["sess-1"]).toBeUndefined();
  });

  it("drops an older sidebar-only name that would hide Claude Code's", () => {
    stateWithRenames({ "sess-1": "Old" });
    applyRename("sess-1", "New", true);
    expect(loadState().renames).toEqual({});
  });

  it("clears a pending rename when given an empty name", () => {
    applyRename("sess-1", "Parser rewrite", true);
    applyRename("sess-1", "", true);
    expect(readPendingRenames()).toEqual({});
  });

  it("refuses an id that is not a session id, changing nothing", () => {
    stateWithRenames({ "../escape": "Old" });
    expect(() => applyRename("../escape", "x", true)).toThrow();
    expect(loadState().renames).toEqual({ "../escape": "Old" });
  });
});

describe("loadRenames", () => {
  it("merges both stores, a pending rename winning", () => {
    stateWithRenames({ a: "Sidebar A", b: "Sidebar B" });
    setPendingRename("b", "Pending B");
    expect(loadRenames()).toEqual({ a: "Sidebar A", b: "Pending B" });
  });
});

describe("switching modes", () => {
  it("hands every sidebar-only name to Claude Code when turned on", () => {
    stateWithRenames({ a: "A", b: "B" });
    moveRenamesToPending();
    expect(readPendingRenames()).toEqual({ a: "A", b: "B" });
    expect(loadState().renames).toEqual({});
  });

  it("keeps a name it cannot park as sidebar-only", () => {
    stateWithRenames({ "bad/id": "Kept" });
    moveRenamesToPending();
    expect(loadState().renames).toEqual({ "bad/id": "Kept" });
  });

  it("keeps every unapplied rename as sidebar-only when turned off", () => {
    setPendingRename("a", "A");
    movePendingToRenames();
    expect(loadState().renames).toEqual({ a: "A" });
    expect(readPendingRenames()).toEqual({});
  });

  it("does not touch the state file when nothing is pending", () => {
    movePendingToRenames();
    expect(fs.existsSync(dirs.STATE_FILE)).toBe(false);
  });
});

it("keeps pending renames in the configured directory", () => {
  setPendingRename("a", "A");
  expect(fs.readdirSync(dirs.PENDING_RENAMES_DIR)).toEqual(["a.json"]);
  expect(path.dirname(dirs.PENDING_RENAMES_DIR)).toBe(dirs.ROOT);
});
