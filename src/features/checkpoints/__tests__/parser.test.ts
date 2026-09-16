import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// vi.hoisted runs before vi.mock hoisting, so the temp root is available
// inside the factory below. Tests write real files into it: the parser's whole
// job is filesystem shape, and a mocked fs would not exercise readdir/lstat
// semantics (symlink dirents, missing blobs, prune races).
const { FILE_HISTORY_DIR, ROOT } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-checkpoints");
  return { ROOT: root, FILE_HISTORY_DIR: _path.join(root, "file-history") };
});

vi.mock("../../../core/config", () => ({ FILE_HISTORY_DIR }));

import {
  blobPath,
  foldSnapshots,
  hashFilePath,
  isValidSessionId,
  listCheckpointSessions,
  listFileVersions,
  parseBackupFileName,
  parseSessionCheckpoints,
  readBlobIndex,
  readCheckpointBlob,
  resolveTrackedPath,
  scanSnapshotLines,
} from "../parser";
import type { TrackedFileBackup } from "../types";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";
const OTHER_SESSION = "0bc64250-c3a3-4936-a32e-2a261f3f49a0";

/** Where this test's transcripts live (outside the history tree, as in reality). */
const TRANSCRIPTS = path.join(ROOT, "projects");

function setup(): void {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(FILE_HISTORY_DIR, { recursive: true });
  fs.mkdirSync(TRANSCRIPTS, { recursive: true });
}

/** Write a blob into a session's history directory. */
function writeBlob(sessionId: string, name: string, contents: string): string {
  const dir = path.join(FILE_HISTORY_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

/** A `file-history-snapshot` JSONL line with the given tracked backups. */
function snapshotLine(
  trackedFileBackups: Record<string, TrackedFileBackup>,
  timestamp = "2026-09-11T19:02:13.560Z",
): string {
  return JSON.stringify({
    type: "file-history-snapshot",
    messageId: "1204e5f4-9883-437e-b3dd-77dadc1c10e2",
    isSnapshotUpdate: false,
    snapshot: {
      messageId: "1204e5f4-9883-437e-b3dd-77dadc1c10e2",
      timestamp,
      trackedFileBackups,
    },
  });
}

/** Write a transcript made of the given raw JSONL lines. Returns its path. */
function writeTranscript(sessionId: string, lines: string[]): string {
  const file = path.join(TRANSCRIPTS, `${sessionId}.jsonl`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

beforeEach(setup);

describe("hashFilePath", () => {
  it("matches the blob prefix Claude Code actually wrote", () => {
    // Verified against real data on disk: this path's backups live under
    // 4edcabe38ffb6832@v1..v3. If this vector ever fails, the on-disk format
    // changed and every lookup in the feature is wrong.
    expect(
      hashFilePath(
        "/Users/vishal/WORK/BINARYVEDA/keus-iot-platform/apps/partners-app/src/infrastructure/services/platform.service.ts",
      ),
    ).toBe("4edcabe38ffb6832");
  });

  it("is 16 lowercase hex characters", () => {
    expect(hashFilePath("/tmp/a.txt")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("distinguishes paths that differ only in case", () => {
    expect(hashFilePath("/tmp/A.txt")).not.toBe(hashFilePath("/tmp/a.txt"));
  });
});

describe("isValidSessionId", () => {
  it("accepts a canonical UUID", () => {
    expect(isValidSessionId(SESSION)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["traversal", "../../../etc"],
    ["absolute path", "/etc/passwd"],
    ["short hex", "09285b5a"],
    ["uuid with a slash", `${SESSION}/x`],
    ["uuid with a trailing dot", `${SESSION}.`],
  ])("rejects %s", (_label, value) => {
    expect(isValidSessionId(value)).toBe(false);
  });
});

describe("parseBackupFileName", () => {
  it("splits a well-formed name", () => {
    expect(parseBackupFileName("4edcabe38ffb6832@v12")).toEqual({
      pathHash: "4edcabe38ffb6832",
      version: 12,
    });
  });

  it.each([
    ["traversal in the hash", "../../../../etc/passwd@v1"],
    ["a path separator", "4edcabe38ffb6832/@v1"],
    ["a backslash", "4edcabe38ffb6832\\v1"],
    ["a trailing traversal", "4edcabe38ffb6832@v1/../../secrets"],
    ["uppercase hex", "4EDCABE38FFB6832@v1"],
    ["a short hash", "4edcabe@v1"],
    ["a long hash", "4edcabe38ffb68321@v1"],
    ["no version", "4edcabe38ffb6832"],
    ["a non-numeric version", "4edcabe38ffb6832@vX"],
    ["version zero", "4edcabe38ffb6832@v0"],
    ["a negative version", "4edcabe38ffb6832@v-1"],
    ["an absolute path", "/etc/passwd"],
  ])("rejects %s", (_label, value) => {
    expect(parseBackupFileName(value)).toBeNull();
  });
});

describe("blobPath", () => {
  it("resolves a valid pair to a direct child of the session directory", () => {
    const resolved = blobPath(SESSION, "4edcabe38ffb6832@v2");
    expect(resolved).toBe(
      path.join(FILE_HISTORY_DIR, SESSION, "4edcabe38ffb6832@v2"),
    );
    expect(path.dirname(resolved as string)).toBe(path.join(FILE_HISTORY_DIR, SESSION));
  });

  it("returns null for a non-UUID session directory", () => {
    expect(blobPath("not-a-uuid", "4edcabe38ffb6832@v1")).toBeNull();
    expect(blobPath("../../../etc", "4edcabe38ffb6832@v1")).toBeNull();
  });

  it("returns null for a traversing backup file name", () => {
    expect(blobPath(SESSION, "../../../../etc/passwd")).toBeNull();
    expect(blobPath(SESSION, "4edcabe38ffb6832@v1/../../../etc/passwd")).toBeNull();
  });
});

describe("readBlobIndex", () => {
  it("returns an empty map when the session has no history directory", () => {
    expect(readBlobIndex(SESSION).size).toBe(0);
  });

  it("indexes well-formed blobs with their byte sizes", () => {
    writeBlob(SESSION, "4edcabe38ffb6832@v1", "abc");
    writeBlob(SESSION, "4edcabe38ffb6832@v2", "abcdefgh");
    const index = readBlobIndex(SESSION);
    expect(index.get("4edcabe38ffb6832@v1")?.sizeBytes).toBe(3);
    expect(index.get("4edcabe38ffb6832@v2")?.sizeBytes).toBe(8);
    expect(index.get("4edcabe38ffb6832@v1")?.mtimeMs).toBeGreaterThan(0);
  });

  it("ignores files that do not match the blob grammar", () => {
    writeBlob(SESSION, "4edcabe38ffb6832@v1", "x");
    fs.writeFileSync(path.join(FILE_HISTORY_DIR, SESSION, "index.json"), "{}");
    fs.writeFileSync(path.join(FILE_HISTORY_DIR, SESSION, "NOTHEX@v1"), "x");
    expect([...readBlobIndex(SESSION).keys()]).toEqual(["4edcabe38ffb6832@v1"]);
  });

  it("ignores a symlink planted in the history tree", () => {
    const secret = path.join(ROOT, "secret.txt");
    fs.writeFileSync(secret, "ssh-private-key");
    const dir = path.join(FILE_HISTORY_DIR, SESSION);
    fs.mkdirSync(dir, { recursive: true });
    fs.symlinkSync(secret, path.join(dir, "aaaaaaaaaaaaaaaa@v1"));
    expect(readBlobIndex(SESSION).size).toBe(0);
  });

  it("returns an empty map for an invalid session id", () => {
    expect(readBlobIndex("../../../etc").size).toBe(0);
  });
});

describe("scanSnapshotLines", () => {
  it("returns nothing for a transcript with no snapshot lines", () => {
    const file = writeTranscript(SESSION, [
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "ok" } }),
    ]);
    expect(scanSnapshotLines(file)).toEqual([]);
  });

  it("returns nothing for a missing transcript", () => {
    expect(scanSnapshotLines(path.join(TRANSCRIPTS, "nope.jsonl"))).toEqual([]);
  });

  it("collects empty snapshots as empty records, not failures", () => {
    const file = writeTranscript(SESSION, [snapshotLine({}), snapshotLine({})]);
    expect(scanSnapshotLines(file)).toEqual([{}, {}]);
  });

  it("skips malformed lines and keeps reading the rest of the file", () => {
    const file = writeTranscript(SESSION, [
      '{"type":"file-history-snapshot", truncated',
      snapshotLine({
        "/a/b.ts": { backupFileName: "aaaaaaaaaaaaaaaa@v1", version: 1 },
      }),
    ]);
    const records = scanSnapshotLines(file);
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0])).toEqual(["/a/b.ts"]);
  });

  it("reads snapshot lines that straddle the 64 KB chunk boundary", () => {
    // A realistic transcript is megabytes of assistant text with a handful of
    // snapshot lines scattered through it. Pad past one chunk so the reader's
    // leftover-carry path is the one under test.
    const filler = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: "x".repeat(70_000) },
    });
    const file = writeTranscript(SESSION, [
      filler,
      snapshotLine({
        "/a/b.ts": { backupFileName: "aaaaaaaaaaaaaaaa@v3", version: 3 },
      }),
    ]);
    expect(scanSnapshotLines(file)).toHaveLength(1);
  });

  it("refuses to follow a symlinked transcript", () => {
    const real = writeTranscript(OTHER_SESSION, [snapshotLine({})]);
    const link = path.join(TRANSCRIPTS, "link.jsonl");
    fs.symlinkSync(real, link);
    expect(scanSnapshotLines(link)).toEqual([]);
  });
});

describe("resolveTrackedPath", () => {
  it("joins a workspace-relative key onto realParentDir", () => {
    // The dominant real shape: 60,033 of 67,390 records key by a relative path.
    expect(
      resolveTrackedPath(
        "packages/web-shared/src/domain/repositories/user.repository.ts",
        "/repo/packages/web-shared/src/domain/repositories",
      ),
    ).toBe("/repo/packages/web-shared/src/domain/repositories/user.repository.ts");
  });

  it("agrees with an absolute key, whose realParentDir is its own dirname", () => {
    expect(resolveTrackedPath("/repo/src/a.ts", "/repo/src")).toBe("/repo/src/a.ts");
  });

  it("falls back to an absolute key when realParentDir is unusable", () => {
    expect(resolveTrackedPath("/repo/src/a.ts", undefined)).toBe("/repo/src/a.ts");
    expect(resolveTrackedPath("/repo/src/a.ts", "relative/dir")).toBe("/repo/src/a.ts");
  });

  it("returns null for a relative key with no absolute parent", () => {
    expect(resolveTrackedPath("src/a.ts", undefined)).toBeNull();
  });

  it("collapses a traversing key into realParentDir rather than above it", () => {
    // basename() is the guard: the key cannot climb out of realParentDir.
    expect(resolveTrackedPath("../../../etc/passwd", "/repo/src")).toBe(
      "/repo/src/passwd",
    );
  });

  it.each([
    ["an empty key", "", "/repo/src"],
    ["a bare dot", ".", "/repo/src"],
    ["a bare dotdot", "..", "/repo/src"],
    ["a trailing-slash directory key", "src/", undefined],
  ])("returns null for %s", (_label, key, rpd) => {
    expect(resolveTrackedPath(key as string, rpd)).toBeNull();
  });
});

describe("foldSnapshots", () => {
  // Blob names must be the real sha256 prefix of the resolved path — the fold
  // drops a record whose hash disagrees, because diff/restore re-derive it.
  const A = "/repo/src/a.ts";
  const B = "/repo/docs/d.md";
  const hashA = hashFilePath(A);
  const hashB = hashFilePath(B);

  it("unions records across lines and keeps one entry per version", () => {
    const folded = foldSnapshots([
      { [A]: { backupFileName: `${hashA}@v1`, version: 1, backupTime: "t1", realParentDir: "/repo/src" } },
      {},
      { [A]: { backupFileName: `${hashA}@v1`, version: 1, backupTime: "t1", realParentDir: "/repo/src" } },
      { [A]: { backupFileName: `${hashA}@v2`, version: 2, backupTime: "t2", realParentDir: "/repo/src" } },
      { [B]: { backupFileName: `${hashB}@v1`, version: 1, backupTime: "t3", realParentDir: "/repo/docs" } },
    ]);

    expect([...folded.keys()].sort()).toEqual([B, A]);
    const a = folded.get(A);
    expect(a?.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(a?.latestVersion).toBe(2);
    expect(a?.latestBackupTime).toBe("t2");
    expect(a?.name).toBe("a.ts");
    expect(a?.dir).toBe("/repo/src");
    expect(a?.pathHash).toBe(hashA);
  });

  it("folds workspace-relative keys under their absolute path", () => {
    const folded = foldSnapshots([
      { "src/a.ts": { backupFileName: `${hashA}@v1`, version: 1, realParentDir: "/repo/src" } },
      { [A]: { backupFileName: `${hashA}@v2`, version: 2, realParentDir: "/repo/src" } },
    ]);
    // The same file under both key shapes folds into ONE entry.
    expect([...folded.keys()]).toEqual([A]);
    expect(folded.get(A)?.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it("keeps the highest version as latest even when lines arrive out of order", () => {
    const folded = foldSnapshots([
      { [A]: { backupFileName: `${hashA}@v5`, version: 5, backupTime: "t5", realParentDir: "/repo/src" } },
      { [A]: { backupFileName: `${hashA}@v2`, version: 2, backupTime: "t2", realParentDir: "/repo/src" } },
    ]);
    expect(folded.get(A)?.latestVersion).toBe(5);
    expect(folded.get(A)?.latestBackupTime).toBe("t5");
    // Still sorted ascending for display.
    expect(folded.get(A)?.versions.map((v) => v.version)).toEqual([2, 5]);
  });

  it("trusts the filename's version over a disagreeing version field", () => {
    const folded = foldSnapshots([
      { [A]: { backupFileName: `${hashA}@v7`, version: 1, realParentDir: "/repo/src" } },
    ]);
    expect(folded.get(A)?.versions[0].version).toBe(7);
  });

  it("returns nothing for records that are all empty", () => {
    expect(foldSnapshots([{}, {}, {}]).size).toBe(0);
  });

  it("drops the 'tracked but not yet backed up' records", () => {
    // 19,704 of 67,390 real records carry backupFileName: null. There is no
    // blob behind them, so they are not versions.
    const folded = foldSnapshots([
      { [A]: { backupFileName: null, version: 0, realParentDir: "/repo/src" } },
      { [A]: { backupFileName: `${hashA}@v1`, version: 1, realParentDir: "/repo/src" } },
    ]);
    expect(folded.get(A)?.versions.map((v) => v.version)).toEqual([1]);
  });

  it("drops a record whose backupFileName traverses", () => {
    const folded = foldSnapshots([
      { [A]: { backupFileName: "../../../../etc/passwd", version: 1, realParentDir: "/repo/src" } },
      { [B]: { backupFileName: "/etc/shadow", version: 1, realParentDir: "/repo/docs" } },
    ]);
    expect(folded.size).toBe(0);
  });

  it("drops a record whose blob hash does not match the path it claims", () => {
    // A transcript that points a plausible-looking blob at /etc/passwd must not
    // produce a restorable row: diff and restore re-derive the hash and would
    // refuse it, so the listing has to agree.
    const folded = foldSnapshots([
      { passwd: { backupFileName: `${hashA}@v1`, version: 1, realParentDir: "/etc" } },
    ]);
    expect(folded.size).toBe(0);
  });

  it("drops a later record that re-points an existing file at another blob", () => {
    const folded = foldSnapshots([
      { [A]: { backupFileName: `${hashA}@v1`, version: 1, realParentDir: "/repo/src" } },
      { [A]: { backupFileName: `${hashB}@v2`, version: 2, realParentDir: "/repo/src" } },
    ]);
    expect(folded.get(A)?.versions.map((v) => v.version)).toEqual([1]);
  });

  it("drops a record keyed by a relative path with no absolute parent", () => {
    expect(
      foldSnapshots([{ "b.ts": { backupFileName: `${hashA}@v1`, version: 1 } }]).size,
    ).toBe(0);
  });

  it("drops a record with no backupFileName at all", () => {
    expect(
      foldSnapshots([{ [A]: { version: 1, realParentDir: "/repo/src" } }]).size,
    ).toBe(0);
  });

  it("leaves availability false — that is the blob index's job", () => {
    const folded = foldSnapshots([
      { [A]: { backupFileName: `${hashA}@v1`, version: 1, realParentDir: "/repo/src" } },
    ]);
    expect(folded.get(A)?.versions[0].available).toBe(false);
    expect(folded.get(A)?.availableCount).toBe(0);
  });
});

describe("parseSessionCheckpoints", () => {
  const FILE_A = "/proj/src/a.ts";
  const FILE_B = "/proj/README.md";
  const hashA = hashFilePath(FILE_A);
  const hashB = hashFilePath(FILE_B);

  it("returns an empty file list for a transcript with no snapshot lines", () => {
    const file = writeTranscript(SESSION, [
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
    ]);
    expect(parseSessionCheckpoints(SESSION, file)).toEqual({
      sessionId: SESSION,
      files: [],
      orphanCount: 0,
    });
  });

  it("resolves each version to its blob and reports sizes", () => {
    writeBlob(SESSION, `${hashA}@v1`, "one");
    writeBlob(SESSION, `${hashA}@v2`, "two-two");
    const transcript = writeTranscript(SESSION, [
      snapshotLine({
        [FILE_A]: { backupFileName: `${hashA}@v1`, version: 1, backupTime: "2026-09-11T19:02:13.560Z" },
      }),
      snapshotLine({}),
      snapshotLine({
        [FILE_A]: { backupFileName: `${hashA}@v2`, version: 2, backupTime: "2026-09-11T19:05:00.000Z" },
      }),
    ]);

    const result = parseSessionCheckpoints(SESSION, transcript);
    expect(result.files).toHaveLength(1);
    const [file] = result.files;
    expect(file.path).toBe(FILE_A);
    expect(file.latestVersion).toBe(2);
    expect(file.availableCount).toBe(2);
    expect(file.versions.map((v) => [v.version, v.available, v.sizeBytes])).toEqual([
      [1, true, 3],
      [2, true, 7],
    ]);
    expect(file.versions[1].backupPath).toBe(
      path.join(FILE_HISTORY_DIR, SESSION, `${hashA}@v2`),
    );
    expect(result.orphanCount).toBe(0);
  });

  it("reports a pruned blob as unavailable instead of throwing", () => {
    // v1 was pruned under cleanupPeriodDays; the transcript still cites it.
    writeBlob(SESSION, `${hashA}@v2`, "two");
    const transcript = writeTranscript(SESSION, [
      snapshotLine({ [FILE_A]: { backupFileName: `${hashA}@v1`, version: 1, backupTime: "t1" } }),
      snapshotLine({ [FILE_A]: { backupFileName: `${hashA}@v2`, version: 2, backupTime: "t2" } }),
    ]);

    const result = parseSessionCheckpoints(SESSION, transcript);
    const [file] = result.files;
    expect(file.versions.map((v) => [v.version, v.available])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(file.availableCount).toBe(1);
    expect(file.versions[0].sizeBytes).toBe(0);
  });

  it("folds in a version whose blob is on disk but the transcript never cites", () => {
    // Measured on real data: 431 of 592 otherwise-unmapped blobs are further
    // versions of files the transcript already named. Folding only what the
    // transcript says would under-report most files.
    writeBlob(SESSION, `${hashA}@v1`, "one");
    writeBlob(SESSION, `${hashA}@v2`, "two");
    writeBlob(SESSION, `${hashA}@v3`, "three");
    const transcript = writeTranscript(SESSION, [
      snapshotLine({ [FILE_A]: { backupFileName: `${hashA}@v1`, version: 1, backupTime: "2026-01-01T00:00:00.000Z" } }),
    ]);

    const result = parseSessionCheckpoints(SESSION, transcript);
    const [file] = result.files;
    expect(file.versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(file.availableCount).toBe(3);
    expect(file.latestVersion).toBe(3);
    // The uncited versions are not orphans — they belong to a known file.
    expect(result.orphanCount).toBe(0);
    // Their timestamps come from the blob mtime, since only the transcript
    // carries the recorded backupTime.
    expect(Number.isNaN(Date.parse(file.versions[2].backupTime))).toBe(false);
  });

  it("keeps the transcript's recorded timestamp for a version it does cite", () => {
    writeBlob(SESSION, `${hashA}@v1`, "one");
    const transcript = writeTranscript(SESSION, [
      snapshotLine({ [FILE_A]: { backupFileName: `${hashA}@v1`, version: 1, backupTime: "2026-01-01T00:00:00.000Z" } }),
    ]);
    expect(parseSessionCheckpoints(SESSION, transcript).files[0].versions[0].backupTime).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("counts blobs the transcript never maps as orphans", () => {
    writeBlob(SESSION, `${hashA}@v1`, "a");
    writeBlob(SESSION, "cccccccccccccccc@v1", "orphan");
    const transcript = writeTranscript(SESSION, [
      snapshotLine({ [FILE_A]: { backupFileName: `${hashA}@v1`, version: 1, backupTime: "t" } }),
    ]);
    expect(parseSessionCheckpoints(SESSION, transcript).orphanCount).toBe(1);
  });

  it("sorts files by most recent backup first", () => {
    writeBlob(SESSION, `${hashA}@v1`, "a");
    writeBlob(SESSION, `${hashB}@v1`, "b");
    const transcript = writeTranscript(SESSION, [
      snapshotLine({
        [FILE_A]: { backupFileName: `${hashA}@v1`, version: 1, backupTime: "2026-01-01T00:00:00.000Z" },
        [FILE_B]: { backupFileName: `${hashB}@v1`, version: 1, backupTime: "2026-06-01T00:00:00.000Z" },
      }),
    ]);
    expect(parseSessionCheckpoints(SESSION, transcript).files.map((f) => f.path)).toEqual([
      FILE_B,
      FILE_A,
    ]);
  });

  it("returns no files when the transcript is gone, but still counts the blobs", () => {
    writeBlob(SESSION, `${hashA}@v1`, "a");
    expect(parseSessionCheckpoints(SESSION, null)).toEqual({
      sessionId: SESSION,
      files: [],
      orphanCount: 1,
    });
  });

  it("handles a transcript written in Claude Code's real record shape", () => {
    // Contract test. Mirrors a verbatim record from ~/.claude/projects: the key
    // is workspace-relative, realParentDir carries the absolute directory, and
    // a tracked-but-unbacked file rides along with backupFileName: null.
    const real = "/Users/v/repo/packages/web-shared/src/domain/user.repository.ts";
    const realHash = hashFilePath(real);
    writeBlob(SESSION, `${realHash}@v2`, "export interface UserRepository {}\n");
    const transcript = writeTranscript(SESSION, [
      snapshotLine({}),
      snapshotLine({
        "packages/web-shared/src/domain/user.repository.ts": {
          backupFileName: `${realHash}@v2`,
          version: 2,
          backupTime: "2026-09-09T08:45:43.924Z",
          realParentDir: "/Users/v/repo/packages/web-shared/src/domain",
        },
        "packages/web-shared/src/domain/brand-new.ts": {
          backupFileName: null,
          version: 0,
          backupTime: "2026-09-09T08:45:43.924Z",
          realParentDir: "/Users/v/repo/packages/web-shared/src/domain",
        },
      }),
    ]);

    const result = parseSessionCheckpoints(SESSION, transcript);
    expect(result.files.map((f) => f.path)).toEqual([real]);
    expect(result.files[0].name).toBe("user.repository.ts");
    expect(result.files[0].dir).toBe("/Users/v/repo/packages/web-shared/src/domain");
    expect(result.files[0].versions).toHaveLength(1);
    expect(result.files[0].versions[0].available).toBe(true);
    expect(result.orphanCount).toBe(0);
  });

  it("returns nothing for a non-UUID session directory", () => {
    const transcript = writeTranscript(SESSION, [
      snapshotLine({ [FILE_A]: { backupFileName: `${hashA}@v1`, version: 1 } }),
    ]);
    expect(parseSessionCheckpoints("../../../etc", transcript)).toEqual({
      sessionId: "../../../etc",
      files: [],
      orphanCount: 0,
    });
  });
});

describe("listFileVersions", () => {
  const FILE_A = "/proj/src/a.ts";
  const hashA = hashFilePath(FILE_A);

  it("finds every version of one file without reading a transcript", () => {
    writeBlob(SESSION, `${hashA}@v1`, "one");
    writeBlob(SESSION, `${hashA}@v3`, "three");
    writeBlob(SESSION, "dddddddddddddddd@v1", "other file");

    const versions = listFileVersions(SESSION, FILE_A);
    expect(versions.map((v) => v.version)).toEqual([1, 3]);
    expect(versions.every((v) => v.available)).toBe(true);
    expect(versions[0].sizeBytes).toBe(3);
    // Timestamps come from blob mtimes here — the transcript is not consulted.
    expect(Number.isNaN(Date.parse(versions[0].backupTime))).toBe(false);
  });

  it("returns nothing for a relative path", () => {
    expect(listFileVersions(SESSION, "src/a.ts")).toEqual([]);
  });

  it("returns nothing for an invalid session id", () => {
    expect(listFileVersions("../../../etc", FILE_A)).toEqual([]);
  });

  it("returns nothing when the file was never touched", () => {
    writeBlob(SESSION, "dddddddddddddddd@v1", "other file");
    expect(listFileVersions(SESSION, FILE_A)).toEqual([]);
  });
});

describe("listCheckpointSessions", () => {
  it("returns nothing when the history root does not exist", () => {
    fs.rmSync(FILE_HISTORY_DIR, { recursive: true, force: true });
    expect(listCheckpointSessions()).toEqual([]);
  });

  it("summarises each session from the directory listing alone", () => {
    writeBlob(SESSION, "aaaaaaaaaaaaaaaa@v1", "12345");
    writeBlob(SESSION, "aaaaaaaaaaaaaaaa@v2", "1234567890");
    writeBlob(SESSION, "bbbbbbbbbbbbbbbb@v1", "x");

    const [summary] = listCheckpointSessions();
    expect(summary.sessionId).toBe(SESSION);
    expect(summary.fileCount).toBe(2);
    expect(summary.versionCount).toBe(3);
    expect(summary.sizeBytes).toBe(16);
    expect(summary.label).toBe(SESSION.slice(0, 8));
    expect(summary.project).toBe("");
    expect(summary.lastBackupMs).toBeGreaterThan(0);
  });

  it("skips directories that are not session ids", () => {
    fs.mkdirSync(path.join(FILE_HISTORY_DIR, "not-a-uuid"), { recursive: true });
    fs.writeFileSync(
      path.join(FILE_HISTORY_DIR, "not-a-uuid", "aaaaaaaaaaaaaaaa@v1"),
      "x",
    );
    writeBlob(SESSION, "aaaaaaaaaaaaaaaa@v1", "x");
    expect(listCheckpointSessions().map((s) => s.sessionId)).toEqual([SESSION]);
  });

  it("skips a session directory with no well-formed blobs", () => {
    fs.mkdirSync(path.join(FILE_HISTORY_DIR, SESSION), { recursive: true });
    fs.writeFileSync(path.join(FILE_HISTORY_DIR, SESSION, "README"), "x");
    expect(listCheckpointSessions()).toEqual([]);
  });

  it("orders sessions by most recent backup first", () => {
    writeBlob(OTHER_SESSION, "aaaaaaaaaaaaaaaa@v1", "old");
    fs.utimesSync(
      path.join(FILE_HISTORY_DIR, OTHER_SESSION, "aaaaaaaaaaaaaaaa@v1"),
      new Date("2020-01-01"),
      new Date("2020-01-01"),
    );
    writeBlob(SESSION, "bbbbbbbbbbbbbbbb@v1", "new");
    expect(listCheckpointSessions().map((s) => s.sessionId)).toEqual([
      SESSION,
      OTHER_SESSION,
    ]);
  });
});

describe("readCheckpointBlob", () => {
  it("returns the exact bytes of the blob", () => {
    writeBlob(SESSION, "aaaaaaaaaaaaaaaa@v1", "line one\nline two\n");
    expect(readCheckpointBlob(SESSION, "aaaaaaaaaaaaaaaa@v1")?.toString("utf-8")).toBe(
      "line one\nline two\n",
    );
  });

  it("round-trips a blob larger than the read buffer", () => {
    const big = "x".repeat(200_000);
    writeBlob(SESSION, "aaaaaaaaaaaaaaaa@v1", big);
    expect(readCheckpointBlob(SESSION, "aaaaaaaaaaaaaaaa@v1")?.toString("utf-8")).toBe(big);
  });

  it("returns null for a pruned blob", () => {
    expect(readCheckpointBlob(SESSION, "aaaaaaaaaaaaaaaa@v1")).toBeNull();
  });

  it("returns null for a traversing backup name", () => {
    expect(readCheckpointBlob(SESSION, "../../../../etc/passwd")).toBeNull();
  });

  it("returns null for an invalid session id", () => {
    writeBlob(SESSION, "aaaaaaaaaaaaaaaa@v1", "x");
    expect(readCheckpointBlob("../../../etc", "aaaaaaaaaaaaaaaa@v1")).toBeNull();
  });

  it("refuses to follow a symlinked blob", () => {
    const secret = path.join(ROOT, "secret.txt");
    fs.writeFileSync(secret, "ssh-private-key");
    const dir = path.join(FILE_HISTORY_DIR, SESSION);
    fs.mkdirSync(dir, { recursive: true });
    fs.symlinkSync(secret, path.join(dir, "aaaaaaaaaaaaaaaa@v1"));
    expect(readCheckpointBlob(SESSION, "aaaaaaaaaaaaaaaa@v1")).toBeNull();
  });
});
