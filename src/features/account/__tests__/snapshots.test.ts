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

vi.mock("../../../core/config", async (importOriginal) => ({
  // The real canonicaliser: snapshot buckets are keyed by it.
  canonicalPath: (await importOriginal<typeof import("../../../core/config")>()).canonicalPath,
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
    pruneSnapshots("global", live, 2);
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

describe("project/local snapshots are scoped to their workspace", () => {
  function projectFile(ws: string, body: Record<string, unknown>): string {
    const file = path.join(tmp.root, ws, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(body));
    return file;
  }

  it("lists only the workspace's own snapshots", () => {
    const a = projectFile("ws-a", { who: "a" });
    const b = projectFile("ws-b", { who: "b" });
    snapshotSettings("project", a);
    snapshotSettings("project", b);
    snapshotSettings("project", b);
    expect(listSnapshots("project", a)).toHaveLength(1);
    expect(listSnapshots("project", b)).toHaveLength(2);
  });

  it.skipIf(process.platform === "win32")(
    "keeps one history for a project opened through a symlink",
    () => {
      const real = projectFile("ws-real", { who: "real" });
      const link = path.join(tmp.root, "ws-link");
      fs.symlinkSync(path.join(tmp.root, "ws-real"), link, "dir");
      snapshotSettings("project", path.join(link, ".claude", "settings.json"));
      expect(listSnapshots("project", real)).toHaveLength(1);
    },
  );

  it("refuses to restore another workspace's snapshot into this one", () => {
    // The pre-fix bug: one shared project/ dir, so B's list offered A's
    // snapshot and restoring wrote A's settings into B.
    const a = projectFile("ws-a", { who: "a" });
    const b = projectFile("ws-b", { who: "b" });
    const idA = snapshotSettings("project", a)!;
    expect(restoreSnapshot("project", b, idA)).toBe(false);
    expect(JSON.parse(fs.readFileSync(b, "utf-8"))).toEqual({ who: "b" });
    expect(restoreSnapshot("project", a, idA)).toBe(true);
  });

  it("does not let one project's writes evict another's history", () => {
    const a = projectFile("ws-a", { who: "a" });
    const b = projectFile("ws-b", { who: "b" });
    snapshotSettings("project", a, 2);
    for (let i = 0; i < 4; i++) snapshotSettings("project", b, 2);
    expect(listSnapshots("project", a)).toHaveLength(1);
    expect(listSnapshots("project", b)).toHaveLength(2);
  });

  it("deletes by id without needing the workspace", () => {
    const a = projectFile("ws-a", { who: "a" });
    const id = snapshotSettings("local", a)!;
    expect(deleteSnapshot("local", id)).toBe(true);
    expect(listSnapshots("local", a)).toHaveLength(0);
  });

  it("ignores legacy unbucketed project snapshots — their workspace is unknown", () => {
    const a = projectFile("ws-a", { who: "a" });
    const legacyDir = path.join(tmp.snapshotsDir, "project");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "settings-1700000000000.json"), '{"who":"?"}');
    expect(listSnapshots("project", a)).toEqual([]);
    expect(restoreSnapshot("project", a, "settings-1700000000000.json")).toBe(false);
  });

  it("rejects ids that are not ones we minted", () => {
    const a = projectFile("ws-a", { who: "a" });
    fs.writeFileSync(path.join(tmp.root, "escape.json"), "{}");
    for (const bad of [
      "../../escape.json",
      "0123456789abcdef/../../escape.json",
      "0123456789abcdef/settings-1.json/x",
    ]) {
      expect(restoreSnapshot("project", a, bad)).toBe(false);
      expect(deleteSnapshot("project", bad)).toBe(false);
    }
    expect(deleteSnapshot("global", "0123456789abcdef/settings-1.json")).toBe(false);
    expect(fs.existsSync(path.join(tmp.root, "escape.json"))).toBe(true);
  });
});
