import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const dirs = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-pending-renames");
  return { ROOT: root, PENDING_RENAMES_DIR: _path.join(root, "pending") };
});

vi.mock("../../../core/config", () => ({ PENDING_RENAMES_DIR: dirs.PENDING_RENAMES_DIR }));

import {
  claimPendingRename,
  clearPendingRename,
  readPendingRenames,
  setPendingRename,
} from "../pendingRenames";

const ID = "4dc4e8fd-f9f4-469a-b13a-5d3faf82734e";

beforeEach(() => {
  fs.rmSync(dirs.ROOT, { recursive: true, force: true });
});

describe("pending renames", () => {
  it("reads nothing before the directory exists", () => {
    expect(readPendingRenames()).toEqual({});
    expect(claimPendingRename(ID)).toBeNull();
  });

  it("stores one trimmed title per session, the latest winning", () => {
    setPendingRename(ID, " First ");
    setPendingRename(ID, "Second");
    expect(readPendingRenames()).toEqual({ [ID]: "Second" });
  });

  it("clears a session's rename, and tolerates one that is gone", () => {
    setPendingRename(ID, "Name");
    clearPendingRename(ID);
    clearPendingRename(ID);
    expect(readPendingRenames()).toEqual({});
  });

  it("refuses an id that could leave the directory", () => {
    expect(() => setPendingRename("../x", "Name")).toThrow(/invalid session id/);
    expect(claimPendingRename("../x")).toBeNull();
  });

  it("ignores temp files, claimed files and malformed entries", () => {
    setPendingRename(ID, "Name");
    fs.writeFileSync(path.join(dirs.PENDING_RENAMES_DIR, "x.json.123.csm-tmp"), "{}");
    fs.writeFileSync(path.join(dirs.PENDING_RENAMES_DIR, "y.json.9.claimed"), '{"title":"t"}');
    fs.writeFileSync(path.join(dirs.PENDING_RENAMES_DIR, "bad.json"), "not json");
    fs.writeFileSync(path.join(dirs.PENDING_RENAMES_DIR, "blank.json"), '{"title":"  "}');
    expect(readPendingRenames()).toEqual({ [ID]: "Name" });
  });
});

describe("claimPendingRename", () => {
  it("hands the title over once and leaves nothing behind", () => {
    setPendingRename(ID, "Parser rewrite");
    expect(claimPendingRename(ID)).toBe("Parser rewrite");
    expect(claimPendingRename(ID)).toBeNull();
    expect(fs.readdirSync(dirs.PENDING_RENAMES_DIR)).toEqual([]);
  });

  it("leaves another session's rename alone", () => {
    setPendingRename(ID, "Mine");
    setPendingRename("other", "Theirs");
    claimPendingRename(ID);
    expect(readPendingRenames()).toEqual({ other: "Theirs" });
  });
});
