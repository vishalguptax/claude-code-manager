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
  it("leads with the verdict and carries the projection", () => {
    const ahead = weeklyPace(windowAfter(3.5 * DAY, 80), CAPTURED);
    expect(describePace(ahead!)).toBe("Ahead of pace · ~160% by reset");
    const even = weeklyPace(windowAfter(3.5 * DAY, 50), CAPTURED);
    expect(describePace(even!)).toBe("On pace · ~100% by reset");
    const under = weeklyPace(windowAfter(3.5 * DAY, 20), CAPTURED);
    expect(describePace(under!)).toBe("Under pace · ~40% by reset");
  });

  it("drops a projection that has stopped being a figure", () => {
    // 99% spent twelve hours in projects to 1386%. The number adds nothing
    // the word "ahead" has not already said.
    const wild = weeklyPace(windowAfter(12 * HOUR, 99), CAPTURED);
    expect(describePace(wild!)).toBe("Ahead of pace for this week");
  });
});
