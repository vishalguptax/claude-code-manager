import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Pin SETTINGS_SNAPSHOTS_DIR to a fresh temp dir for the entire test
// run so we never touch the user's real ~/.claude. vi.hoisted lets the
// mock factory below see the variable even though `vi.mock` is hoisted
// above the import block at compile time.
const tmp = vi.hoisted(() => {
  const fsLocal = require("fs") as typeof import("fs");
  const osLocal = require("os") as typeof import("os");
  const pathLocal = require("path") as typeof import("path");
  const dir = fsLocal.mkdtempSync(pathLocal.join(osLocal.tmpdir(), "cm-snap-"));
  return { snapshotsDir: pathLocal.join(dir, "snapshots"), root: dir };
});

vi.mock("../../../core/config", () => ({
  CLAUDE_DIR: tmp.root,
  HISTORY_FILE: path.join(tmp.root, "history.jsonl"),
  PROJECTS_DIR: path.join(tmp.root, "projects"),
  SESSIONS_DIR: path.join(tmp.root, "sessions"),
  STATE_FILE: path.join(tmp.root, ".csm-state.json"),
  STATS_CACHE_FILE: path.join(tmp.root, "stats-cache.json"),
  SESSION_META_READ_BYTES: 4096,
  SETTINGS_SNAPSHOTS_DIR: tmp.snapshotsDir,
}));

import {
  snapshotSettings,
  listSnapshots,
  pruneSnapshots,
  restoreSnapshot,
  deleteSnapshot,
} from "../snapshots";

beforeEach(() => {
  try {
    fs.rmSync(tmp.snapshotsDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function makeLive(): string {
  const dir = path.join(tmp.root, "live");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "settings.json");
  try {
    fs.unlinkSync(file);
  } catch {
    // ignore
  }
  return file;
}

describe("snapshots module", () => {
  it("snapshotSettings returns null when the live file does not exist", () => {
    const live = path.join(tmp.root, "absent.json");
    expect(snapshotSettings("global", live)).toBeNull();
  });

  it("creates a snapshot file under the scope dir + lists it back", () => {
    const live = makeLive();
    fs.writeFileSync(live, JSON.stringify({ model: "opus", n: 1 }));
    const id = snapshotSettings("global", live);
    expect(id).toMatch(/^settings-\d+/);

    const list = listSnapshots("global", live);
    expect(list).toHaveLength(1);
    expect(list[0].scope).toBe("global");
    expect(list[0].sizeBytes).toBeGreaterThan(0);
  });

  it("changedKeys reports keys that differ vs. the next newer snapshot/live file", () => {
    const live = makeLive();
    fs.writeFileSync(live, JSON.stringify({ model: "opus", voice: false }));
    snapshotSettings("global", live);
    fs.writeFileSync(
      live,
      JSON.stringify({ model: "opus", voice: true, brandNew: 1 }),
    );
    const list = listSnapshots("global", live);
    expect(list[0].changedKeys.sort()).toEqual(["brandNew", "voice"]);
  });

  it("pruneSnapshots keeps only the N newest files", () => {
    const live = makeLive();
    fs.writeFileSync(live, JSON.stringify({ a: 0 }));
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(live, JSON.stringify({ a: i }));
      snapshotSettings("global", live, 100);
    }
    pruneSnapshots("global", 2);
    expect(listSnapshots("global", live)).toHaveLength(2);
  });

  it("restoreSnapshot replaces the live file with the snapshot bytes", () => {
    const live = makeLive();
    fs.writeFileSync(live, JSON.stringify({ flavor: "old" }));
    snapshotSettings("global", live);
    fs.writeFileSync(live, JSON.stringify({ flavor: "new" }));
    const [snap] = listSnapshots("global", live);
    expect(restoreSnapshot("global", live, snap.id)).toBe(true);
    expect(JSON.parse(fs.readFileSync(live, "utf-8"))).toEqual({ flavor: "old" });
  });

  it("deleteSnapshot removes a single entry", () => {
    const live = makeLive();
    fs.writeFileSync(live, JSON.stringify({ a: 1 }));
    snapshotSettings("global", live);
    const list = listSnapshots("global", live);
    expect(list).toHaveLength(1);
    expect(deleteSnapshot("global", list[0].id)).toBe(true);
    expect(listSnapshots("global", live)).toHaveLength(0);
  });
});
