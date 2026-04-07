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
