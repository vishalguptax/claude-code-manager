import { describe, expect, it } from "vitest";
import type { QuotaWindow } from "../../quota";
import { describePace, weeklyPace } from "./pace";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const CAPTURED = "2026-09-14T12:00:00.000Z";
const CAPTURED_MS = Date.parse(CAPTURED);

/** A window whose reset is `elapsed` into a 7-day period at capture time. */
function windowAfter(elapsedMs: number, utilization: number): QuotaWindow {
  return {
    utilization,
    resetsAt: new Date(CAPTURED_MS + (7 * DAY - elapsedMs)).toISOString(),
  };
}

describe("weeklyPace", () => {
  it("calls an even burn on pace", () => {
    const pace = weeklyPace(windowAfter(3.5 * DAY, 50), CAPTURED);
    expect(pace).toMatchObject({
      verdict: "on-track",
      elapsedPercent: 50,
      projectedPercent: 100,
      // Landing exactly on the cap is not "running out" — no date to give.
      exhaustsAt: "",
    });
  });

  it("calls overspending ahead of pace and says when the cap lands", () => {
    // 80% gone at the halfway mark projects to 160%, and the remaining 20
    // points last a quarter as long as the 80 already spent: 21 hours.
    const pace = weeklyPace(windowAfter(3.5 * DAY, 80), CAPTURED);
    expect(pace?.verdict).toBe("ahead");
    expect(pace?.projectedPercent).toBe(160);
    expect(pace?.exhaustsAt).toBe(new Date(CAPTURED_MS + 21 * HOUR).toISOString());
  });

  it("never puts the cap after the reset", () => {
    const w = windowAfter(6 * DAY, 95);
    const pace = weeklyPace(w, CAPTURED);
    expect(pace?.verdict).toBe("ahead");
    expect(Date.parse(pace?.exhaustsAt ?? "")).toBeLessThan(Date.parse(w.resetsAt));
  });

  it("calls underspending under pace with no cap date", () => {
    const pace = weeklyPace(windowAfter(3.5 * DAY, 20), CAPTURED);
    expect(pace).toMatchObject({ verdict: "under", projectedPercent: 40, exhaustsAt: "" });
  });

  it("holds the dead band so a single session does not flip the verdict", () => {
    // A weekday-only week runs ahead by Friday and lands on Sunday; a
    // verdict that flipped on every few points would be reporting noise.
    expect(weeklyPace(windowAfter(3.5 * DAY, 52.5), CAPTURED)?.verdict).toBe("on-track");
    expect(weeklyPace(windowAfter(3.5 * DAY, 47.5), CAPTURED)?.verdict).toBe("on-track");
    expect(weeklyPace(windowAfter(3.5 * DAY, 55), CAPTURED)?.verdict).toBe("ahead");
    expect(weeklyPace(windowAfter(3.5 * DAY, 45), CAPTURED)?.verdict).toBe("under");
  });

  it("stays silent in the first hours of a window", () => {
    // One ordinary session six hours in divides out to ~700%. A warning
    // that fires every Monday morning is one the user stops reading.
    expect(weeklyPace(windowAfter(6 * HOUR, 6), CAPTURED)).toBeNull();
    // The threshold itself still reports.
    expect(weeklyPace(windowAfter(12 * HOUR, 6), CAPTURED)).not.toBeNull();
  });

  it("measures elapsed time from the capture, not from now", () => {
    // The utilization figure is frozen at Claude Code's last render. If the
    // clock ran on while the numerator stood still, an idle account would
    // drift towards "under pace" by doing nothing at all.
    const ancient = "2020-01-01T00:00:00.000Z";
    const w: QuotaWindow = {
      utilization: 80,
      resetsAt: new Date(Date.parse(ancient) + 3.5 * DAY).toISOString(),
    };
    expect(weeklyPace(w, ancient)).toMatchObject({ verdict: "ahead", elapsedPercent: 50 });
  });

  it("says nothing without a reset time", () => {
    expect(weeklyPace({ utilization: 80, resetsAt: "" }, CAPTURED)).toBeNull();
    expect(weeklyPace({ utilization: 80, resetsAt: "not a date" }, CAPTURED)).toBeNull();
  });

  it("says nothing when the capture cannot be placed in time", () => {
    expect(weeklyPace(windowAfter(3.5 * DAY, 80), "")).toBeNull();
  });

  it("says nothing once the cached window has rolled over", () => {
    // The reset is behind the render: `used` describes a window that no
    // longer exists, so any pace read from it is about the wrong week.
    const w: QuotaWindow = {
      utilization: 80,
      resetsAt: new Date(CAPTURED_MS - HOUR).toISOString(),
    };
    expect(weeklyPace(w, CAPTURED)).toBeNull();
  });

  it("handles an untouched window without dividing by zero", () => {
    expect(weeklyPace(windowAfter(3.5 * DAY, 0), CAPTURED)).toMatchObject({
      verdict: "under",
      projectedPercent: 0,
      exhaustsAt: "",
    });
  });

  it("floors a nonsensical negative utilization at zero", () => {
    expect(weeklyPace(windowAfter(3.5 * DAY, -5), CAPTURED)?.projectedPercent).toBe(0);
  });
});

describe("describePace", () => {
  it("says when the allowance runs out, not what percentage it projects", () => {
    // 80% gone at the halfway mark: the cap is hit 21h after the capture,
    // so 63h — 2d 15h — short of the refill. That gap is the fact the user
    // can act on; "~160%" is the same fact as a sum they have to do.
    const ahead = weeklyPace(windowAfter(3.5 * DAY, 80), CAPTURED);
    expect(describePace(ahead!).text).toBe("Runs out 2d 15h before reset");
  });

  it("keeps the underlying projection in the tooltip", () => {
    const ahead = weeklyPace(windowAfter(3.5 * DAY, 80), CAPTURED);
    expect(describePace(ahead!).title).toContain("160%");
    expect(describePace(ahead!).title).toContain("2d 15h");
  });

  it("reassures plainly when the allowance reaches the reset", () => {
    for (const used of [50, 20]) {
      const pace = weeklyPace(windowAfter(3.5 * DAY, used), CAPTURED);
      expect(describePace(pace!).text).toBe("On track to last the week");
    }
  });

  it("keeps the caption to one unit under a day", () => {
    // Late in the window the shortfall is hours, not days. Note the band
    // stops being reachable near the reset at all — at 6.5 days elapsed
    // "ahead" would need more than 100% used — so the warning naturally
    // falls silent once it could no longer be acted on.
    const ahead = weeklyPace(windowAfter(6 * DAY, 99), CAPTURED);
    expect(ahead?.verdict).toBe("ahead");
    expect(describePace(ahead!).text).toMatch(/^Runs out \d+h before reset$/);
  });

  it("still names a gap when the projection is off the scale", () => {
    // 99% spent twelve hours in projects to ~1386%. The percentage stops
    // being a figure; the gap it implies does not.
    const wild = weeklyPace(windowAfter(12 * HOUR, 99), CAPTURED);
    expect(describePace(wild!).text).toMatch(/^Runs out .+ before reset$/);
  });
});
