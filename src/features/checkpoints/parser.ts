/**
 * File Checkpoints parser — reads Claude Code's per-file version backups.
 *
 * ## The on-disk format
 *
 * Blobs live at `~/.claude/file-history/<sessionId>/<pathHash>@v<N>` and are
 * the full contents of one file at one point in time, plain bytes, `N` from 1.
 * `pathHash` is `sha256(<absolute file path>).slice(0, 16)` in hex.
 *
 * **There is no index file in that directory.** The `path -> blob` mapping
 * exists only in the session transcript, in JSONL lines shaped like:
 *
 * ```json
 * {"type":"file-history-snapshot","snapshot":{"timestamp":"…",
 *   "trackedFileBackups":{"/abs/file.md":{"backupFileName":"7595ab38251e4a3e@v2",
 *     "version":2,"backupTime":"…","realParentDir":"/abs"}}}}
 * ```
 *
 * `trackedFileBackups` is `{}` on most lines — an empty snapshot is the common
 * case, never a parse failure. A session's picture is the UNION across every
 * snapshot line, with the highest `version` per path winning as the latest.
 *
 * Two details the shape above does not show, both confirmed against 67,390
 * real records: the map KEY is usually workspace-relative, not absolute, and
 * `realParentDir` is the absolute directory to resolve it against
 * ({@link resolveTrackedPath}); and `backupFileName` is `null` for a file that
 * is tracked but has no backup yet, which is 29% of records.
 *
 * ## Trust
 *
 * A transcript is user-influenced input: anything can be written into a JSONL
 * line. Session ids come from directory names and backup filenames come from
 * the transcript, so both are validated against anchored grammars before they
 * are joined onto a path. Every read goes through `openFileNoFollow` — the
 * file-history tree carries the same symlink exposure as the transcript tree.
 *
 * ## Cost
 *
 * Listing never opens a blob. Availability and size come from one `readdir`
 * plus an `lstat` per referenced blob; blob bytes are read only when the user
 * asks for a diff or a restore.
 *
 * Pure Node.js file I/O — no VS Code dependency.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { FILE_HISTORY_DIR } from "../../core/config";
import { openFileNoFollow } from "../../core/safeOpen";
import { createLineDecoder } from "../../core/lineDecoder";
import type {
  CheckpointFile,
  CheckpointSessionSummary,
  CheckpointVersion,
  FileHistorySnapshotEntry,
  SessionCheckpoints,
  TrackedFileBackup,
} from "./types";

/**
 * Session directory names are Claude Code session ids — canonical lowercase
 * UUIDs. Anchored, so a name containing a path separator or a `..` segment
 * can never reach {@link sessionHistoryDir}.
 */
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Blob filename grammar: 16 lowercase hex digits, `@v`, then the version.
 *
 * This anchored pattern IS the traversal guard. It admits no `/`, no `\`, no
 * `.`, so a `backupFileName` of `../../../.ssh/id_rsa` — or an absolute path —
 * fails before any `path.join`, and the joined result can only ever be a
 * direct child of the session directory.
 */
const BACKUP_FILE_RE = /^([0-9a-f]{16})@v(\d+)$/;

/**
 * Upper bound on a blob we will read into memory for a diff or a restore.
 * Claude Code backs up source files, so real blobs are kilobytes; a blob past
 * this is either corrupt or not what we think it is, and pulling it into the
 * extension host would freeze the window. Listing is unaffected — it never
 * reads a blob at all.
 */
const MAX_BLOB_BYTES = 32 * 1024 * 1024;

/**
 * Substring every snapshot line contains. Transcripts routinely run to tens of
 * megabytes and snapshot lines are a small fraction of them, so we reject on
 * the raw line before paying for `JSON.parse`.
 */
const SNAPSHOT_MARKER = '"file-history-snapshot"';

/**
 * The blob filename prefix for an absolute file path:
 * `sha256(path).slice(0, 16)`, hex.
 *
 * Verified against real data — `/Users/vishal/WORK/BINARYVEDA/keus-iot-platform/apps/partners-app/src/infrastructure/services/platform.service.ts`
 * hashes to `4edcabe38ffb6832`, which is the blob prefix Claude Code wrote.
 *
 * This is the forward lookup: given a file, find its versions without scanning
 * a transcript.
 */
export function hashFilePath(absolutePath: string): string {
  return crypto.createHash("sha256").update(absolutePath).digest("hex").slice(0, 16);
}

/** True when `id` is a canonical UUID and therefore safe to path-join. */
export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id);
}

/**
 * Split a validated `<pathHash>@v<N>` blob name, or `null` when it does not
 * match the grammar. Rejecting here is what keeps a hostile transcript inside
 * the history directory.
 */
export function parseBackupFileName(
  name: string,
): { pathHash: string; version: number } | null {
  const m = BACKUP_FILE_RE.exec(name);
  if (!m) return null;
  const version = Number(m[2]);
  // `\d+` admits "007" and arbitrarily long runs of digits; require a real,
  // finite version number so the UI never sorts on NaN or Infinity.
  if (!Number.isSafeInteger(version) || version < 1) return null;
  return { pathHash: m[1], version };
}

/** Absolute path of a session's history directory, or `null` for a bad id. */
export function sessionHistoryDir(sessionId: string): string | null {
  if (!isValidSessionId(sessionId)) return null;
  return path.join(FILE_HISTORY_DIR, sessionId);
}

/**
 * Absolute path of one blob, or `null` when either the session id or the
 * backup filename fails validation. Both grammars are anchored, so a
 * successful return is always a direct child of the session directory.
 */
export function blobPath(sessionId: string, backupFileName: string): string | null {
  const dir = sessionHistoryDir(sessionId);
  if (dir === null) return null;
  if (parseBackupFileName(backupFileName) === null) return null;
  return path.join(dir, backupFileName);
}

/** What a listing needs to know about a blob. Never its contents. */
export interface BlobStat {
  sizeBytes: number;
  /** Last-modified epoch ms — the only timestamp a blob carries by itself. */
  mtimeMs: number;
}

/**
 * Blob name -> {@link BlobStat} for every regular file in a session's history
 * directory. One `readdir` plus an `lstat` per entry; no blob is opened.
 *
 * `withFileTypes` reports a symlink as a symlink, so links planted in the tree
 * are dropped here and never become an "available" version.
 *
 * Returns an empty map when the directory is missing — a session with no
 * recorded edits is the normal case, not an error.
 */
export function readBlobIndex(sessionId: string): Map<string, BlobStat> {
  const index = new Map<string, BlobStat>();
  const dir = sessionHistoryDir(sessionId);
  if (dir === null) return index;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return index;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (parseBackupFileName(entry.name) === null) continue;
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(path.join(dir, entry.name));
    } catch {
      // Deleted between the readdir and the stat — a normal race against
      // Claude Code's own pruning. Treat it as absent.
      continue;
    }
    index.set(entry.name, { sizeBytes: stat.size, mtimeMs: stat.mtimeMs });
  }
  return index;
}

/**
 * Stream a transcript and return every `trackedFileBackups` map it records,
 * in file order. Lines that are not snapshots are rejected on a substring test
 * before `JSON.parse`; malformed lines and empty snapshots are skipped.
 *
 * Reads in 64 KB chunks so only a chunk plus the accumulated records are
 * resident, however large the transcript is.
 */
export function scanSnapshotLines(
  transcriptPath: string,
): Record<string, TrackedFileBackup>[] {
  // Symlink-safe: the transcript tree is not ours, and a planted link must not
  // make us read a file outside it.
  const fd = openFileNoFollow(transcriptPath);
  if (fd === null) return [];

  const records: Record<string, TrackedFileBackup>[] = [];
  const CHUNK = 64 * 1024;
  const buf = Buffer.alloc(CHUNK);
  const decoder = createLineDecoder();
  let bytesRead: number;

  const take = (line: string): void => {
    if (!line.includes(SNAPSHOT_MARKER)) return;
    let entry: FileHistorySnapshotEntry;
    try {
      entry = JSON.parse(line) as FileHistorySnapshotEntry;
    } catch {
      return; // Partial write or corruption — skip the line, keep the file.
    }
    if (entry?.type !== "file-history-snapshot") return;
    const backups = entry.snapshot?.trackedFileBackups;
    if (!backups || typeof backups !== "object") return;
    records.push(backups);
  };

  try {
    // Loop to EOF: a short read is legal mid-file, so gating on a full
    // chunk would silently truncate. The shared decoder carries partial
    // lines AND partial multi-byte sequences across the boundary.
    while (true) {
      bytesRead = fs.readSync(fd, buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      for (const line of decoder.push(buf, bytesRead)) take(line);
    }
    const leftover = decoder.end();
    if (leftover) take(leftover);
  } catch {
    // A read error mid-file yields whatever we already folded rather than
    // nothing: a partial history is more useful than an empty tab.
  } finally {
    fs.closeSync(fd);
  }

  return records;
}

/**
 * The absolute path a `trackedFileBackups` entry refers to, or `null` when the
 * entry cannot name a real file.
 *
 * The map key is NOT reliably absolute. Measured across 67,390 real records on
 * this machine, 60,033 keys are workspace-relative (`packages/web/src/a.ts`)
 * and only 7,357 are absolute. `realParentDir` is the absolute directory and
 * is present on every record; the file is `basename(key)` inside it. For the
 * absolute keys, `realParentDir` always equalled `dirname(key)`, so one rule
 * covers both shapes.
 *
 * `basename` is also the guard: a key of `../../../etc/passwd` collapses to
 * `passwd` and lands inside `realParentDir`, never above it.
 */
export function resolveTrackedPath(
  key: string,
  realParentDir: unknown,
): string | null {
  if (typeof key !== "string" || key === "") return null;
  const base = path.basename(key);
  if (base === "" || base === "." || base === "..") return null;
  if (typeof realParentDir === "string" && path.isAbsolute(realParentDir)) {
    return path.join(realParentDir, base);
  }
  // No usable parent directory: only a key that is already absolute can stand
  // on its own. A bare relative key names nothing we could restore to.
  return path.isAbsolute(key) ? key : null;
}

/**
 * Fold snapshot records into one version list per file path.
 *
 * Pure: takes the records {@link scanSnapshotLines} produced and returns the
 * union across them. Later lines re-state earlier versions, so a version is
 * recorded once per `(path, version)` and the highest version per path is the
 * latest. Availability is left `false` here — {@link parseSessionCheckpoints}
 * fills it in from the blob index.
 *
 * Three kinds of record are dropped:
 *
 *  - `backupFileName: null` — the common "tracked but not yet backed up" state
 *    (19,704 of 67,390 real records). There is no blob to offer.
 *  - a `backupFileName` that is not `<16 hex>@v<N>`, or a key that resolves to
 *    no real path — neither can address a blob.
 *  - a record whose blob hash disagrees with `sha256(resolvedPath)`. The two
 *    agreed on all 47,686 real records that had a blob name, so a disagreement
 *    means the transcript is describing a file it did not actually back up.
 *    Dropping it keeps the list consistent with diff/restore, which re-derive
 *    the blob name from the path and would refuse such a record anyway.
 */
export function foldSnapshots(
  records: Record<string, TrackedFileBackup>[],
): Map<string, CheckpointFile> {
  const byPath = new Map<string, CheckpointFile>();

  for (const backups of records) {
    for (const [key, backup] of Object.entries(backups)) {
      const filePath = resolveTrackedPath(key, backup?.realParentDir);
      if (filePath === null) continue;
      const name = backup?.backupFileName;
      if (typeof name !== "string") continue;
      const parsed = parseBackupFileName(name);
      if (parsed === null) continue;

      // The transcript carries `version` separately; trust the filename, which
      // is what actually addresses the blob, and ignore a disagreeing field.
      const { pathHash, version } = parsed;
      const backupTime = typeof backup.backupTime === "string" ? backup.backupTime : "";

      let file = byPath.get(filePath);
      if (!file) {
        // One hash per distinct path, not per record: a long session re-states
        // the same files on every snapshot line.
        if (hashFilePath(filePath) !== pathHash) continue;
        file = {
          path: filePath,
          name: path.basename(filePath),
          dir: path.dirname(filePath),
          pathHash,
          versions: [],
          latestVersion: 0,
          latestBackupTime: "",
          availableCount: 0,
        };
        byPath.set(filePath, file);
      } else if (file.pathHash !== pathHash) {
        continue;
      }

      const existing = file.versions.find((v) => v.version === version);
      if (existing) {
        // Same version seen again. Keep the first timestamp we have; only fill
        // a blank one in, so a later line cannot rewrite recorded history.
        if (!existing.backupTime && backupTime) existing.backupTime = backupTime;
      } else {
        file.versions.push({
          version,
          backupFileName: name,
          backupPath: null,
          backupTime,
          available: false,
          sizeBytes: 0,
        });
      }

      if (version >= file.latestVersion) {
        file.latestVersion = version;
        if (backupTime) file.latestBackupTime = backupTime;
      }
    }
  }

  for (const file of byPath.values()) file.versions.sort((a, b) => a.version - b.version);
  return byPath;
}

/**
 * Every file a session touched, with each version resolved to its blob.
 *
 * A version whose blob is missing is reported with `available: false` — Claude
 * Code prunes the history tree on its own `cleanupPeriodDays` schedule while
 * the transcript keeps citing what it wrote, so a pruned blob is an expected
 * state and must degrade, never throw.
 *
 * Version lists are the union of what the transcript cites and what the blob
 * index holds under the file's hash, so a file is never under-reported because
 * a snapshot line was trimmed.
 *
 * Returns an empty file list when the transcript has no snapshot lines.
 */
export function parseSessionCheckpoints(
  sessionId: string,
  transcriptPath: string | null,
): SessionCheckpoints {
  const blobs = readBlobIndex(sessionId);
  if (!isValidSessionId(sessionId) || transcriptPath === null) {
    return { sessionId, files: [], orphanCount: blobs.size };
  }

  const byPath = foldSnapshots(scanSnapshotLines(transcriptPath));
  const claimed = new Set<string>();

  for (const file of byPath.values()) {
    // Versions the transcript cites. Some of their blobs are pruned; those
    // stay listed as unavailable so the version numbers do not silently skip.
    for (const version of file.versions) {
      version.backupPath = blobPath(sessionId, version.backupFileName);
      const stat = blobs.get(version.backupFileName);
      if (stat !== undefined && version.backupPath !== null) {
        version.available = true;
        version.sizeBytes = stat.sizeBytes;
        file.availableCount++;
      }
      claimed.add(version.backupFileName);
    }

    // Versions the transcript does NOT cite but whose blobs are on disk under
    // this file's hash. This is the forward lookup earning its keep: measured
    // on real data, 431 of 592 otherwise-unmapped blobs are further versions of
    // files the transcript already named, so folding only what the transcript
    // says would under-report most files. Timestamps come from the blob mtime —
    // the recorded backupTime exists only in the transcript.
    const known = new Set(file.versions.map((v) => v.version));
    for (const [name, stat] of blobs) {
      const parsed = parseBackupFileName(name);
      if (parsed === null || parsed.pathHash !== file.pathHash) continue;
      claimed.add(name);
      if (known.has(parsed.version)) continue;
      file.versions.push({
        version: parsed.version,
        backupFileName: name,
        backupPath: blobPath(sessionId, name),
        backupTime: new Date(stat.mtimeMs).toISOString(),
        available: true,
        sizeBytes: stat.sizeBytes,
      });
      file.availableCount++;
      if (parsed.version > file.latestVersion) {
        file.latestVersion = parsed.version;
        file.latestBackupTime = new Date(stat.mtimeMs).toISOString();
      }
    }
    file.versions.sort((a, b) => a.version - b.version);
  }

  const files = [...byPath.values()].sort(
    (a, b) => b.latestBackupTime.localeCompare(a.latestBackupTime) || a.path.localeCompare(b.path),
  );

  return { sessionId, files, orphanCount: blobs.size - claimed.size };
}

/**
 * Every version of ONE file in a session, resolved from the blob index alone.
 *
 * This is the forward lookup the path hash exists for: it answers "all
 * versions of this file" without touching the transcript, so the version list
 * stays correct even after the transcript is trimmed or deleted. Timestamps
 * come from blob mtimes — the transcript is the only source of the recorded
 * `backupTime`, and it is not consulted here.
 */
export function listFileVersions(
  sessionId: string,
  absoluteFilePath: string,
): CheckpointVersion[] {
  if (!path.isAbsolute(absoluteFilePath)) return [];
  const dir = sessionHistoryDir(sessionId);
  if (dir === null) return [];

  const wanted = hashFilePath(absoluteFilePath);
  const versions: CheckpointVersion[] = [];

  for (const [name, stat] of readBlobIndex(sessionId)) {
    const parsed = parseBackupFileName(name);
    if (parsed === null || parsed.pathHash !== wanted) continue;
    versions.push({
      version: parsed.version,
      backupFileName: name,
      backupPath: path.join(dir, name),
      backupTime: new Date(stat.mtimeMs).toISOString(),
      available: true,
      sizeBytes: stat.sizeBytes,
    });
  }

  return versions.sort((a, b) => a.version - b.version);
}

/**
 * Summarise every session that has checkpoint history, newest first.
 *
 * Directory listing only — no transcript is opened, so this stays cheap with
 * dozens of sessions and tens of megabytes of blobs. `label` and `project`
 * default to the id; the host fills them in from its cached session list.
 */
export function listCheckpointSessions(): CheckpointSessionSummary[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(FILE_HISTORY_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const summaries: CheckpointSessionSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidSessionId(entry.name)) continue;
    const dir = path.join(FILE_HISTORY_DIR, entry.name);

    let blobs: fs.Dirent[];
    try {
      blobs = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const hashes = new Set<string>();
    let versionCount = 0;
    let sizeBytes = 0;
    let lastBackupMs = 0;
    for (const blob of blobs) {
      if (!blob.isFile()) continue;
      const parsed = parseBackupFileName(blob.name);
      if (parsed === null) continue;
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(path.join(dir, blob.name));
      } catch {
        continue;
      }
      hashes.add(parsed.pathHash);
      versionCount++;
      sizeBytes += stat.size;
      if (stat.mtimeMs > lastBackupMs) lastBackupMs = stat.mtimeMs;
    }

    if (versionCount === 0) continue;
    summaries.push({
      sessionId: entry.name,
      label: entry.name.slice(0, 8),
      project: "",
      fileCount: hashes.size,
      versionCount,
      lastBackupMs,
      sizeBytes,
    });
  }

  return summaries.sort((a, b) => b.lastBackupMs - a.lastBackupMs);
}

/**
 * Read one blob's exact bytes, or `null` when it cannot be served — bad id,
 * bad filename, pruned, a symlink, or past {@link MAX_BLOB_BYTES}.
 *
 * This is the ONLY function here that opens a blob. Listing paths must not
 * call it.
 */
export function readCheckpointBlob(
  sessionId: string,
  backupFileName: string,
): Buffer | null {
  const file = blobPath(sessionId, backupFileName);
  if (file === null) return null;

  const fd = openFileNoFollow(file);
  if (fd === null) return null;
  try {
    const { size } = fs.fstatSync(fd);
    if (size > MAX_BLOB_BYTES) return null;
    const buf = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const read = fs.readSync(fd, buf, offset, size - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    return offset === size ? buf : buf.subarray(0, offset);
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}
