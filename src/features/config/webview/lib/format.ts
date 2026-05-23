/**
 * Config-local formatters for the settings-history list. These differ from
 * the shared `formatDate`/`formatBytes` helpers on purpose:
 *   - `formatTime` renders a full localized date+time (snapshots need the
 *     clock, not just the day), with an ISO fallback if the locale call throws.
 *   - `formatKb` caps at KB and returns "" for non-positive/NaN input, so the
 *     row simply omits the size chip rather than showing "0 B".
 */

/** Full localized date+time for a snapshot, or "" when the timestamp is unusable. */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return new Date(ms).toISOString();
  }
}

/** Compact size for a snapshot (B/KB), or "" when the byte count is unusable. */
export function formatKb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
