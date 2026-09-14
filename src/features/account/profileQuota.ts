/**
 * How a remembered quota reads. Pure presentation of the `ProfileQuota`
 * shape — no filesystem, no `vscode` — because both sides of the webview
 * boundary render it: the native account switcher picks rows with it, and
 * the Quota card falls back to it while a freshly-switched account has no
 * live figures yet. ./quotaHistory owns reading and writing the data; this
 * file only turns it into a line of text.
 */
import type { ProfileQuota } from "./types";

/**
 * Past this age a remembered figure stops being useful. Seven days is the
 * weekly window itself: once a whole window has passed, the percentage
 * describes a period that has since reset, so quoting it would be worse
 * than saying nothing.
 */
const FORGET_AFTER_MS = 7 * 24 * 60 * 60_000;

/**
 * One short line for a switcher row: "62% weekly · 3h ago".
 *
 * The age is not decoration. These figures are as old as the account's
 * last session, which for the account you are switching AWAY from is
 * minutes and for one you last touched a fortnight ago is meaningless —
 * a bare "62%" would read as current in both cases. Returns "" when
 * there is nothing honest to say.
 */
export function describeProfileQuota(
  quota: ProfileQuota | null | undefined,
  now: number = Date.now(),
): string {
  if (!quota || quota.sevenDayPercent === null) return "";
  const capturedMs = Date.parse(quota.capturedAt);
  if (Number.isNaN(capturedMs)) return "";
  const age = now - capturedMs;
  if (age >= FORGET_AFTER_MS) return "";
  // A window that has reset since the capture makes the percentage a
  // figure for a period that no longer exists.
  const resetMs = Date.parse(quota.sevenDayResetsAt);
  if (!Number.isNaN(resetMs) && now >= resetMs) return "";
  return `${Math.round(quota.sevenDayPercent)}% weekly · ${shortAge(age)}`;
}

/** Coarse relative age — one unit is enough at a glance. */
function shortAge(ms: number): string {
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
