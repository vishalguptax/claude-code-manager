/**
 * Is the weekly window being spent faster than the week is passing?
 *
 * The 7-day cap is the one that strands people: the 5-hour window refills
 * the same day, so burning it is an inconvenience, while exhausting the
 * weekly one can cost days. But a bare "62% used" says nothing on its own
 * — 62% on Tuesday is a problem and 62% on Saturday is not. Comparing the
 * share consumed against the share of the window already gone turns the
 * same number into an answer.
 *
 * This is arithmetic over data we already hold. No network call, no token,
 * no new permission — see ../../quota for why that constraint is absolute.
 *
 * Two things it deliberately does NOT do:
 *
 *   - It measures elapsed time from the CAPTURE, not from wall-clock now.
 *     The utilization figure is frozen at Claude Code's last statusline
 *     render; letting the clock run on while the numerator stands still
 *     would walk any idle account towards "under pace" purely by sitting
 *     there, and the longer the idle, the more confident the wrong answer.
 *   - It says nothing in the first hours of a window. Right after a reset
 *     the elapsed fraction is near zero, so one ordinary session divides
 *     out to a projection of several hundred percent. That is noise with
 *     a decimal point, and a warning that cries wolf every Monday morning
 *     is a warning the user learns to ignore.
 */
import type { QuotaWindow } from "../../quota";

/** Length of the weekly window. */
const WEEK_MS = 7 * 24 * 60 * 60_000;

/**
 * Minimum elapsed time before a projection means anything. Half a day is
 * enough for a single burst to average out, and still leaves six and a
 * half days of warning.
 */
const MIN_ELAPSED_MS = 12 * 60 * 60_000;

/**
 * Dead band around a perfectly even burn, in projected percentage points.
 * Real use is lumpy — a weekday-only week sits ahead by Friday and lands
 * on Sunday — so a verdict that flips on every session would be reporting
 * noise. Ten points is roughly one heavy session's worth of slack.
 */
const BAND_PCT = 10;

export type PaceVerdict =
  /** Spending faster than the window is passing. Will overrun if it holds. */
  | "ahead"
  /** Within the dead band of an even burn. */
  | "on-track"
  /** Spending slower than the window is passing. */
  | "under";

export interface Pace {
  verdict: PaceVerdict;
  /** Share of the window already gone at capture time, 0–100. */
  elapsedPercent: number;
  /** Utilization the window reaches by reset if this rate holds, 0–…. */
  projectedPercent: number;
  /**
   * ISO time utilization would reach 100% at this rate, or "" when that
   * lands after the reset (i.e. the cap is never hit this window).
   */
  exhaustsAt: string;
}

/**
 * Pace for a weekly window, or null when the data cannot support one.
 *
 * Null — not a neutral verdict — for: a window with no reset time, a
 * capture we cannot place in time, a reset that has already passed (the
 * cached figure belongs to a window that has since rolled over), and a
 * window too young to project. Each of those is "we don't know", and the
 * caller renders nothing rather than a shrug.
 *
 * Only meaningful for the 7-day window. The 5-hour one is short enough
 * that its elapsed fraction is dominated by whether a session happens to
 * be running, which measures timing, not spend.
 */
export function weeklyPace(window: QuotaWindow, capturedAtIso: string): Pace | null {
  if (!window.resetsAt) return null;
  const resetMs = Date.parse(window.resetsAt);
  const capturedMs = Date.parse(capturedAtIso);
  if (Number.isNaN(resetMs) || Number.isNaN(capturedMs)) return null;

  const remaining = resetMs - capturedMs;
  // Reset already behind the capture: the window rolled over before this
  // render, so `used` describes a window that no longer exists.
  if (remaining <= 0) return null;

  const elapsed = WEEK_MS - remaining;
  if (elapsed < MIN_ELAPSED_MS) return null;

  const used = Math.max(0, window.utilization);
  const elapsedFraction = elapsed / WEEK_MS;
  const projectedPercent = used / elapsedFraction;

  const verdict: PaceVerdict =
    projectedPercent >= 100 + BAND_PCT
      ? "ahead"
      : projectedPercent <= 100 - BAND_PCT
        ? "under"
        : "on-track";

  // Time to reach 100% at the observed rate. Reported only when it lands
  // inside this window — past the reset the cap is never reached, and a
  // date beyond the refill would read as a threat that cannot happen.
  let exhaustsAt = "";
  if (used > 0 && projectedPercent > 100) {
    const msTo100 = ((100 - used) / used) * elapsed;
    exhaustsAt = new Date(capturedMs + msTo100).toISOString();
  }

  return {
    verdict,
    elapsedPercent: elapsedFraction * 100,
    projectedPercent,
    exhaustsAt,
  };
}

/**
 * One short line for the bar's sub-caption.
 *
 * The projection is the payload — "ahead of pace" alone gives the user
 * nothing to decide with, while "~134% by reset" says exactly how much
 * to slow down. It is rounded and prefixed with a tilde because it is an
 * extrapolation from a lumpy week, not a measurement.
 */
export function describePace(pace: Pace): string {
  const label =
    pace.verdict === "ahead" ? "Ahead of pace" : pace.verdict === "under" ? "Under pace" : "On pace";
  // A projection in the thousands is arithmetically true and useless as a
  // figure; the verdict already carries the message at that point.
  const projected = Math.round(pace.projectedPercent);
  if (projected > 999) return `${label} for this week`;
  return `${label} · ~${projected}% by reset`;
}
