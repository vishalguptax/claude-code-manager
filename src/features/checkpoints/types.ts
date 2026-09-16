/**
 * Domain types for the File Checkpoints feature.
 *
 * Claude Code keeps a versioned backup of every file it edits under
 * `~/.claude/file-history/<sessionId>/<pathHash>@v<N>`. The blobs are plain
 * file contents with no index; the `path -> blob` mapping lives only in the
 * session transcript, as JSONL lines of `type: "file-history-snapshot"`.
 *
 * Everything here crosses the postMessage boundary, so every field is plain
 * JSON — no Date, no Map, no class instance.
 */

/**
 * One `file-history-snapshot` entry as it appears in a session transcript.
 * `trackedFileBackups` is frequently `{}` — most snapshot lines record
 * nothing, which is normal, not a failure.
 */
export interface FileHistorySnapshotEntry {
  type: "file-history-snapshot";
  messageId?: string;
  isSnapshotUpdate?: boolean;
  snapshot?: {
    messageId?: string;
    timestamp?: string;
    trackedFileBackups?: Record<string, TrackedFileBackup>;
  };
}

/**
 * One backup record for one file at one version, as written by Claude Code.
 *
 * The map key this hangs off is usually workspace-relative; `realParentDir` is
 * what makes it absolute. See `resolveTrackedPath` in `parser.ts`.
 */
export interface TrackedFileBackup {
  /**
   * `<pathHash>@v<N>` — the blob's filename inside the session directory, or
   * `null` when the file is tracked but has not been backed up yet (29% of
   * real records). A null here means there is nothing to offer, not an error.
   */
  backupFileName?: string | null;
  version?: number;
  /** ISO timestamp of when the backup was taken. */
  backupTime?: string;
  /** Absolute directory the real file lives in. Present on every real record. */
  realParentDir?: string;
}

/** One recorded version of one file. */
export interface CheckpointVersion {
  /** `N` from `@v<N>`. Starts at 1. */
  version: number;
  /** `<pathHash>@v<N>`, validated against the blob-name grammar. */
  backupFileName: string;
  /** Absolute path of the blob, or `null` when the name failed validation. */
  backupPath: string | null;
  /** ISO timestamp recorded in the transcript. */
  backupTime: string;
  /**
   * False when the transcript cites this version but the blob is not on disk —
   * Claude Code pruned it under `cleanupPeriodDays`. A normal, expected state:
   * the version is listed and greyed out, never an error.
   */
  available: boolean;
  /** Blob size in bytes; `0` when unavailable. */
  sizeBytes: number;
}

/** Every recorded version of one tracked file, newest version last. */
export interface CheckpointFile {
  /** Absolute path of the working file this history belongs to. */
  path: string;
  /** Basename, for display. */
  name: string;
  /** Containing directory, for display. */
  dir: string;
  /** `sha256(path).slice(0, 16)` — the blob filename prefix. */
  pathHash: string;
  /** Ascending by `version`. */
  versions: CheckpointVersion[];
  /** Highest version number seen across every snapshot line. */
  latestVersion: number;
  /** Backup time of the highest version. */
  latestBackupTime: string;
  /** How many of `versions` are actually on disk. */
  availableCount: number;
}

/** Full checkpoint picture for one session. */
export interface SessionCheckpoints {
  sessionId: string;
  /** Sorted by most recently backed up first. */
  files: CheckpointFile[];
  /**
   * Blobs in the session directory under a hash no tracked file resolves to.
   * Versions that merely went uncited by the transcript are NOT counted here:
   * they are folded into their file via the path hash. A non-zero count means
   * the transcript was trimmed, imported, or deleted while the blobs survived,
   * so we surface it rather than silently under-reporting the session.
   */
  orphanCount: number;
}

/**
 * A session that has checkpoint history, summarised from the directory
 * listing alone — no transcript is read to build this. `label` and `project`
 * are filled in by the host from the cached session list when it knows the id.
 */
export interface CheckpointSessionSummary {
  sessionId: string;
  /** Session name if the host could resolve one, else the short id. */
  label: string;
  /** Project folder name, or `""` when the session is no longer on disk. */
  project: string;
  /** Distinct `pathHash` prefixes in the directory — i.e. files touched. */
  fileCount: number;
  /** Total blob count. */
  versionCount: number;
  /** Epoch ms of the newest blob's mtime. */
  lastBackupMs: number;
  /** Total bytes the session's blobs occupy. */
  sizeBytes: number;
}

/** Outcome of a restore attempt, reported back to the caller. */
export interface RestoreResult {
  ok: boolean;
  /** Why it did not happen: "cancelled" when the user declined the modal. */
  reason?: "cancelled" | "unavailable" | "write-failed";
}
