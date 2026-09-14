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
  /**
   * How long before the reset the cap would be hit, in ms. Null when the
   * cap is never reached this window. This is the figure the caption is
   * built from: "you run out this far before it refills" is the thing a
   * user can act on, where a projected percentage is a sum they have to
   * do themselves.
   */
  shortfallMs: number | null;
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
  let shortfallMs: number | null = null;
  if (used > 0 && projectedPercent > 100) {
    const msTo100 = ((100 - used) / used) * elapsed;
    const exhaustMs = capturedMs + msTo100;
    exhaustsAt = new Date(exhaustMs).toISOString();
    shortfallMs = resetMs - exhaustMs;
  }

  return {
    verdict,
    elapsedPercent: elapsedFraction * 100,
    projectedPercent,
    exhaustsAt,
    shortfallMs,
  };
}

/** Everything the bar needs to draw a pace: a ghost fill and a countdown. */
export interface PaceDisplay {
  /**
   * Where this window lands by reset if the rate holds, 0–100, drawn as a
   * faint segment ahead of the real fill. Clamped at 100 because the bar
   * has no room past the cap — overshoot shows as the ghost reaching the
   * end, which is exactly what running out looks like.
   */
  projectedWidth: number;
  /**
   * Live countdown to the cap ("out in 13h"), sitting opposite the reset
   * timer so the two read as a pair: whichever is shorter happens first.
   * Empty when the allowance reaches the reset — silence is the calm
   * state, since a card that comments when nothing is wrong trains the
   * user to stop reading it.
   */
  countdown: string;
  /**
   * The conclusion in one short line, under the bar. The ghost and the
   * countdown are both compact, and compact is not the same as legible:
   * a first-time reader has no way to know what a faint segment means.
   * This says it outright, in a sentence short enough to take in at a
   * glance, so nothing load-bearing is hidden behind a hover.
   */
  sentence: string;
  /** The reading in full, for the row's tooltip. */
  title: string;
}

/**
 * Turn a pace into what the bar draws, against a live clock.
 *
 * The countdown is recomputed from `now` rather than frozen at capture,
 * so it ticks down like the reset timer beside it. It disappears once it
 * would run negative: the moment came and went with no fresh render, and
 * "out 3h ago" is a claim the data cannot support — the user may simply
 * not have been working. The ghost fill stays either way.
 */
export function paceDisplay(pace: Pace, now: number = Date.now()): PaceDisplay {
  const projectedWidth = Math.max(0, Math.min(100, pace.projectedPercent));
  const projected = Math.round(pace.projectedPercent);

  // Both sentences are written to the same shape so the two states read
  // as one scale rather than two unrelated messages.
  const ahead = pace.verdict === "ahead";
  const sentence = ahead ? "Not enough to last the week." : "Enough to last the week.";

  let countdown = "";
  if (ahead && pace.exhaustsAt) {
    const remaining = Date.parse(pace.exhaustsAt) - now;
    if (remaining > 0) countdown = `out in ${roughDuration(remaining)}`;
  }

  const title =
    `${sentence} At this rate you spend about ${projected}% of a week's ` +
    `allowance over the week; the faint bar is where that lands.`;

  return { projectedWidth, countdown, sentence, title };
}

/**
 * Coarse duration for the countdown: one unit below a day, two above it.
 * "2d 4h" is a plan; "2d 4h 13m" is false precision on an extrapolation.
 */
function roughDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const leftover = hours % 24;
  return leftover > 0 ? `${days}d ${leftover}h` : `${days}d`;
}
