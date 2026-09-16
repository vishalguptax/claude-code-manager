/**
 * Pure helpers for the File Checkpoints views. No signals, no DOM — every
 * function here takes its inputs and returns a value, so the views stay
 * declarative and the logic is directly testable.
 */
import type { CheckpointFile, CheckpointVersion } from "../../types";

/**
 * Files whose name or directory contains `query` (case-insensitive). An empty
 * or whitespace-only query returns the list unchanged — and the SAME array
 * reference, so an unfiltered render does not invalidate downstream memos.
 */
export function filterCheckpointFiles(
  files: CheckpointFile[],
  query: string,
): CheckpointFile[] {
  const q = query.trim().toLowerCase();
  if (!q) return files;
  return files.filter(
    (f) => f.name.toLowerCase().includes(q) || f.dir.toLowerCase().includes(q),
  );
}

/**
 * One-line summary of a file's history: how many versions exist, and how many
 * of them Claude Code has since pruned. The pruned count is stated rather than
 * hidden — a user who sees "6 versions" and can only open 2 deserves to know
 * why before clicking.
 */
export function describeFileHistory(file: CheckpointFile): string {
  const total = file.versions.length;
  const missing = total - file.availableCount;
  const plural = total === 1 ? "version" : "versions";
  return missing > 0 ? `${total} ${plural} · ${missing} pruned` : `${total} ${plural}`;
}

/**
 * Newest version first. The list arrives ascending (v1 … vN) because that is
 * the order the history was written in, but the version a user wants is
 * almost always the most recent one.
 */
export function newestFirst(versions: CheckpointVersion[]): CheckpointVersion[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

/**
 * Epoch ms for a version's recorded backup time, or `0` when the transcript
 * carried no timestamp. `0` is the sentinel the views check before formatting,
 * because `formatRelativeTime(NaN)` renders nonsense.
 */
export function backupTimeMs(version: CheckpointVersion): number {
  if (!version.backupTime) return 0;
  const ms = Date.parse(version.backupTime);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Shorten an absolute directory for display by dropping the leading home or
 * workspace prefix. Purely cosmetic: the full path is still what the row's
 * `title` shows and what a restore is confirmed against.
 */
export function shortenDir(dir: string, workspacePath?: string): string {
  if (workspacePath && dir.startsWith(workspacePath)) {
    const rest = dir.slice(workspacePath.length).replace(/^[/\\]/, "");
    return rest === "" ? "." : rest;
  }
  return dir;
}
