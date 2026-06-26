/**
 * General-purpose utility functions for the webview.
 * Pure functions with no side effects or dependencies on state.
 */

/**
 * Escape a string for safe HTML insertion.
 * Creates a temporary DOM element and reads back its innerHTML.
 */
export function esc(t: string): string {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

/**
 * Format a Unix timestamp into a human-readable time string (e.g. "3:45 PM").
 */
export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a Unix timestamp as a compact relative time (e.g. "2m", "4h", "3d").
 * Falls back to a date string for things older than ~1 year.
 *
 * Scale:
 *   < 45s   → "now"
 *   < 1h    → "2m", "44m"
 *   < 24h   → "1h", "23h"
 *   < 30d   → "1d", "29d"
 *   < 365d  → "1mo", "11mo"
 *   else    → "1y", "2y"
 */
export function fmtRelativeTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

/**
 * Format a duration in milliseconds as a compact human-readable string.
 *
 * Auto-scales the unit so a 13-day session does not render as "19714m":
 *   <  1 minute → "<1m"
 *   <  1 hour   → "30m"
 *   <  1 day    → "2h 25m"
 *   >= 1 day    → "13d 16h"
 *
 * Days drop the minutes and hours drop the seconds — at those scales the
 * tail unit is noise. We always show two units max so the string stays
 * narrow enough to fit in a metadata row.
 */
export function fmtDuration(ms: number): string {
  if (ms < 60000) return "<1m";
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `${totalMins}m`;
  const totalHours = Math.floor(totalMins / 60);
  const minsPart = totalMins % 60;
  if (totalHours < 24) return `${totalHours}h ${minsPart}m`;
  const days = Math.floor(totalHours / 24);
  const hoursPart = totalHours % 24;
  return `${days}d ${hoursPart}h`;
}

/**
 * Return a human-readable group label for a given timestamp.
 * Possible values: "Today", "Yesterday", "This Week", or "Month Year".
 */
export function dateLabel(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= today) return "Today";
  if (d >= new Date(today.getTime() - 86400000)) return "Yesterday";
  if (d >= new Date(today.getTime() - 7 * 86400000)) return "This Week";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Return the Unix timestamp for the start of the current day (midnight local time).
 */
export function dayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Flash temporary text on a button element, restoring the original after 1.2 seconds.
 * Used for copy-confirmation feedback.
 */
export function flash(id: string, text: string): void {
  const b = document.getElementById(id);
  if (!b) return;
  const orig = b.textContent;
  b.textContent = text;
  setTimeout(() => {
    b.textContent = orig;
  }, 1200);
}

/**
 * Shared empty-state renderer. Creates a styled empty state with optional
 * icon, title, description, and action button.
 */
export function renderEmptyState(opts: {
  iconSvg?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionId?: string;
}): string {
  return `
    <div class="state-empty">
      ${opts.iconSvg ? `<div class="state-empty-icon">${opts.iconSvg}</div>` : ""}
      <div class="state-empty-title">${esc(opts.title)}</div>
      ${opts.description ? `<div class="state-empty-desc">${esc(opts.description)}</div>` : ""}
      ${opts.actionLabel && opts.actionId ? `<button class="btn" id="${opts.actionId}">${esc(opts.actionLabel)}</button>` : ""}
    </div>`;
}
