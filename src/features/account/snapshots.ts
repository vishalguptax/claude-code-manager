/**
 * Settings snapshot history. Every `writeSettingsValue` /
 * `addPermissionEntry` / `removePermissionEntry` call writes a copy
 * of the live settings.json to
 * ~/.claude/.claude-manager-snapshots/<scope>/[<fileKey>/]settings-<epoch>.json
 * before the mutation lands. Restore = swap the live file for the
 * chosen snapshot's bytes after a confirm modal.
 *
 * Project/local snapshots live in a per-file bucket (`<fileKey>`, a hash
 * of the live file's path) and carry it in their id. One shared
 * directory per scope meant restoring in project B could write project
 * A's settings into B, and every project's edits evicted the others'
 * history from the shared ring. Global has one live file, so it keeps
 * its unbucketed directory and ids (existing global history stays
 * usable). Legacy unbucketed project/local snapshots are never listed or
 * restored: nothing records which workspace they came from.
 *
 * Why a custom directory and not VS Code's `Memento`? Snapshots can
 * be megabytes for permission-heavy projects, they need to survive
 * across machines (the snapshots travel with `~/.claude`), and the
 * webview already knows how to render filesystem paths. A
 * file-per-snapshot also lets the user reach in with a diff tool if
 * the UI flow is ever stuck.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { SETTINGS_SNAPSHOTS_DIR, canonicalPath } from "../../core/config";
import { writeFileAtomic } from "../../core/atomicWrite";
import type { PermissionScope } from "./types";

/** Default cap on how many snapshots we keep per scope. */
export const SNAPSHOT_KEEP_DEFAULT = 20;

/** One snapshot's metadata, surfaced to the webview list. */
export interface SettingsSnapshot {
  /**
   * Identifier used by the restore + delete messages: the filename, and
   * for project/local `<fileKey>/<filename>`, so it names the file it
   * belongs to.
   */
  id: string;
  /** Epoch ms taken when the snapshot was written. */
  takenAtMs: number;
  /** Scope the snapshot belongs to (`global` / `project` / `local`). */
  scope: PermissionScope;
  /**
   * Top-level keys that differ between this snapshot and the next
   * newer one (or the live settings.json when this is the newest).
   * Empty when no diff was computable. Sorted alphabetically so the
   * UI list is deterministic.
   */
  changedKeys: string[];
  /** File size in bytes. Surfaced as a sanity hint in the UI. */
  sizeBytes: number;
}

/**
 * Bucket key for a project/local live file: a short hash of its canonical
 * path. "" for global (one live file, no bucket). Canonical — symlinks
 * resolved, case folded where the filesystem ignores case — so a project
 * opened through a link, or with different casing on macOS, keeps one
 * snapshot history instead of splitting into two.
 */
function fileKey(scope: PermissionScope, liveFilePath: string): string {
  if (scope === "global") return "";
  return crypto.createHash("sha256").update(canonicalPath(liveFilePath)).digest("hex").slice(0, 16);
}

function bucketDir(scope: PermissionScope, key: string): string {
  return key
    ? path.join(SETTINGS_SNAPSHOTS_DIR, scope, key)
    : path.join(SETTINGS_SNAPSHOTS_DIR, scope);
}

const SNAPSHOT_NAME = /^settings-\d+(?:-\d+)?\.json$/;

/**
 * Split and validate a snapshot id. The id arrives from the webview, so
 * it is checked against the exact shapes we mint — nothing else may
 * reach a path join (no `..`, no separators beyond the one bucket).
 */
function parseId(
  scope: PermissionScope,
  snapshotId: string,
): { key: string; name: string } | null {
  const parts = snapshotId.split("/");
  const [key, name] = parts.length === 2 ? parts : ["", parts[0]];
  if (parts.length > 2 || !SNAPSHOT_NAME.test(name)) return null;
  if (scope === "global" ? key !== "" : !/^[0-9a-f]{16}$/.test(key)) return null;
  return { key, name };
}

function idFor(key: string, name: string): string {
  return key ? `${key}/${name}` : name;
}

function safeReadJson(filePath: string): unknown {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Compute the set of top-level keys that differ between two parsed
 * settings JSON objects. Stringify-compare each key — covers nested
 * objects without exploding the leaf paths into the UI. Order
 * doesn't matter inside arrays so the comparison is structural via
 * stable JSON.
 */
function diffTopLevelKeys(a: unknown, b: unknown): string[] {
  const aObj = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const bObj = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(aObj), ...Object.keys(bObj)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(aObj[k]) !== JSON.stringify(bObj[k])) changed.push(k);
  }
  return changed.sort();
}

/**
 * Parse the embedded epoch out of a snapshot filename. Returns NaN
 * when the file doesn't match the expected pattern so callers can
 * filter it out. Strict pattern keeps stray `.bak` files / accidental
 * additions from leaking into the UI list.
 */
function parseEpoch(filename: string): number {
  const m = /^settings-(\d+)\.json$/.exec(filename);
  if (!m) return NaN;
  return parseInt(m[1], 10);
}

/**
 * Write a snapshot of the live settings.json (referenced by
 * `liveFilePath`) into the scope directory. Returns the snapshot id
 * (filename) on success or null when the live file doesn't exist.
 *
 * Pruning runs after a successful write so the directory never
 * grows past `keep`. We never throw — a failed snapshot must not
 * prevent the underlying mutation from going through; the caller
 * surfaces its own errors.
 */
export function snapshotSettings(
  scope: PermissionScope,
  liveFilePath: string,
  keep: number = SNAPSHOT_KEEP_DEFAULT,
): string | null {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(liveFilePath);
  } catch {
    // No live file to snapshot — first-time write.
    return null;
  }

  const key = fileKey(scope, liveFilePath);
  const dir = bucketDir(scope, key);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return null;
  }

  // Epoch + a 4-digit suffix so back-to-back writes within the same
  // millisecond don't collide. Math.random is fine here — collision
  // risk is cosmetic, the suffix only disambiguates filenames.
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0")}`;
  const filename = `settings-${stamp}.json`;
  try {
    fs.writeFileSync(path.join(dir, filename), bytes);
  } catch {
    return null;
  }

  pruneSnapshots(scope, liveFilePath, keep);
  return idFor(key, filename);
}

/**
 * List snapshots of one live file, newest first, with diff annotations.
 * Each entry's `changedKeys` shows what changed compared to the next
 * newer snapshot (or the live settings.json for the head).
 */
export function listSnapshots(
  scope: PermissionScope,
  liveFilePath: string,
): SettingsSnapshot[] {
  const key = fileKey(scope, liveFilePath);
  const dir = bucketDir(scope, key);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  // Snapshots themselves use a `<epoch>-<rand>` stamp; we sort by
  // the leading epoch (extracted via parseEpoch) and ignore stray
  // files. Two snapshots written in the same millisecond fall back
  // to filename comparison — close enough for display order.
  const stamped = entries
    .map((name) => {
      const m = /^settings-(\d+)(?:-(\d+))?\.json$/.exec(name);
      if (!m) return null;
      return { name, epoch: parseInt(m[1], 10) };
    })
    .filter((x): x is { name: string; epoch: number } => x !== null)
    .sort((a, b) => b.epoch - a.epoch || b.name.localeCompare(a.name));

  // Pre-parse each snapshot once so the diff loop doesn't re-read
  // every neighbour from disk. Live settings parsed once at the head.
  const parsed = stamped.map((s) => safeReadJson(path.join(dir, s.name)));
  const live = safeReadJson(liveFilePath);

  return stamped.map((s, i) => {
    const next = i === 0 ? live : parsed[i - 1];
    const changedKeys = diffTopLevelKeys(parsed[i], next);
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(path.join(dir, s.name)).size;
    } catch {
      // ignore — size is informational
    }
    return {
      id: idFor(key, s.name),
      takenAtMs: s.epoch,
      scope,
      changedKeys,
      sizeBytes,
    };
  });
}

/**
 * Roll one live file's snapshot directory down to `keep` newest
 * entries. Older entries are unlinked. Best-effort — a failure to delete
 * one entry does not abort the rest of the prune.
 */
export function pruneSnapshots(
  scope: PermissionScope,
  liveFilePath: string,
  keep: number = SNAPSHOT_KEEP_DEFAULT,
): void {
  const dir = bucketDir(scope, fileKey(scope, liveFilePath));
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const stamped = entries
    .filter((n) => !Number.isNaN(parseEpoch(n)) || /^settings-\d+-\d+\.json$/.test(n))
    .map((name) => ({ name, epoch: parseInt(/(\d+)/.exec(name)?.[1] ?? "0", 10) }))
    .sort((a, b) => b.epoch - a.epoch);

  for (const stale of stamped.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, stale.name));
    } catch {
      // ignore
    }
  }
}

/**
 * Replace the live settings.json with the bytes stored at the given
 * snapshot. Snapshots the current live file first so the restore is
 * itself reversible. Returns true on success.
 *
 * Refuses a snapshot taken of a different file: a project/local id
 * whose bucket is not this live file's is another workspace's settings.
 */
export function restoreSnapshot(
  scope: PermissionScope,
  liveFilePath: string,
  snapshotId: string,
): boolean {
  const id = parseId(scope, snapshotId);
  if (!id || id.key !== fileKey(scope, liveFilePath)) return false;
  const src = path.join(bucketDir(scope, id.key), id.name);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(src);
  } catch {
    return false;
  }

  // Best-effort snapshot of the file we're about to overwrite — keeps
  // the restore reversible from the same panel.
  snapshotSettings(scope, liveFilePath);

  try {
    fs.mkdirSync(path.dirname(liveFilePath), { recursive: true });
    // Atomic: Claude Code reads this file at any moment, and a torn
    // restore would leave it a file Claude Code skips entirely.
    writeFileAtomic(liveFilePath, bytes);
    return true;
  } catch {
    return false;
  }
}

/** Delete a single snapshot by id (the id names its own bucket). */
export function deleteSnapshot(
  scope: PermissionScope,
  snapshotId: string,
): boolean {
  const id = parseId(scope, snapshotId);
  if (!id) return false;
  try {
    fs.unlinkSync(path.join(bucketDir(scope, id.key), id.name));
    return true;
  } catch {
    return false;
  }
}
