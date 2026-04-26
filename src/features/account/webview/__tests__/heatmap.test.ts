import { describe, it, expect } from "vitest";
import { buildHeatmap, cutoffDaysForPeriod } from "../heatmap";
import type { DailyActivity, DailyTokens } from "../../types";

/** Mid-day local time so tests don't drift across DST boundaries. */
function day(iso: string): Date {
  return new Date(iso + "T12:00:00");
}

describe("buildHeatmap", () => {
  it("defaults to a single column showing the current week", () => {
    // No startDate → smallest meaningful heatmap (the current week).
    const today = day("2026-04-25"); // Sat
    const model = buildHeatmap(today, [], []);
    expect(model.weeks).toBe(1);
    const todayCells = model.cells.filter((c) => c.state === "today");
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].col).toBe(0);
    expect(todayCells[0].row).toBe(5);
    expect(todayCells[0].date).toBe("2026-04-25");
  });

  it("widens dynamically to fully contain [startDate, today]", () => {
    const today = day("2026-04-25");
    const model = buildHeatmap(today, [], [], { startDate: "2026-02-01" });

    // Feb 1 is a Sunday (dow=6). Monday-aligned start = Jan 26.
    // Last column ends Sun Apr 26. Span = 91 days = 13 weeks.
    expect(model.rangeStart).toBe("2026-01-26");
    expect(model.rangeEnd).toBe("2026-04-25");
    expect(model.weeks).toBe(13);
    expect(model.cells).toHaveLength(13 * 7);
  });

  it("places today in the rightmost column at the correct weekday row", () => {
    const today = day("2026-04-25"); // Sat → dow=5
    const model = buildHeatmap(today, [], [], { startDate: "2026-03-01" });
    const todayCell = model.cells.find((c) => c.state === "today");
    expect(todayCell?.col).toBe(model.weeks - 1);
    expect(todayCell?.row).toBe(5);
    expect(todayCell?.date).toBe("2026-04-25");
  });

  it("marks cells past today as future and zero-levels them", () => {
    const today = day("2026-04-25");
    const model = buildHeatmap(today, [], [], { startDate: "2026-04-01" });
    const future = model.cells.filter((c) => c.state === "future");

    // Sat (today) → only Sun is future in the last column.
    expect(future).toHaveLength(1);
    expect(future[0].date).toBe("2026-04-26");
    expect(future[0].level).toBe(0);
  });

  it("scales intensity on tokens when token data is present", () => {
    const today = day("2026-04-25");
    const tokens: DailyTokens[] = [
      { date: "2026-04-20", total: 1000 },
      { date: "2026-04-21", total: 500 },
      { date: "2026-04-22", total: 250 },
      { date: "2026-04-23", total: 50 },
    ];
    const daily: DailyActivity[] = [
      { date: "2026-04-20", messageCount: 50, sessionCount: 5, toolCallCount: 0 },
    ];
    const model = buildHeatmap(today, daily, tokens, { startDate: "2026-04-01" });

    expect(model.scale).toBe("tokens");
    expect(model.max).toBe(1000);

    const byDate = new Map(model.cells.map((c) => [c.date, c]));
    expect(byDate.get("2026-04-20")?.level).toBe(4);
    expect(byDate.get("2026-04-21")?.level).toBe(2);
    expect(byDate.get("2026-04-22")?.level).toBe(1);
    expect(byDate.get("2026-04-23")?.level).toBe(1);
  });

  it("falls back to message count when no token data is recorded", () => {
    const today = day("2026-04-25");
    const daily: DailyActivity[] = [
      { date: "2026-04-20", messageCount: 40, sessionCount: 4, toolCallCount: 0 },
      { date: "2026-04-21", messageCount: 10, sessionCount: 1, toolCallCount: 0 },
    ];
    const model = buildHeatmap(today, daily, [], { startDate: "2026-04-01" });

    expect(model.scale).toBe("messages");
    expect(model.max).toBe(40);
    const byDate = new Map(model.cells.map((c) => [c.date, c]));
    expect(byDate.get("2026-04-20")?.level).toBe(4);
    expect(byDate.get("2026-04-21")?.level).toBe(1);
  });

  it("returns scale=none and max=0 when no activity exists", () => {
    const model = buildHeatmap(day("2026-04-25"), [], [], { startDate: "2026-03-01" });
    expect(model.scale).toBe("none");
    expect(model.max).toBe(0);
    expect(model.cells.every((c) => c.level === 0)).toBe(true);
  });

  it("year-suffixes month labels that fall in a different year than today", () => {
    const today = day("2026-02-07"); // Sat
    const model = buildHeatmap(today, [], [], { startDate: "2025-11-15" });
    const labels = model.monthLabels.map((m) => m.label);

    expect(labels.some((l) => l.startsWith("Nov '25"))).toBe(true);
    expect(labels).toContain("Jan");
    expect(labels).toContain("Feb");
  });

  it("uses local-time ISO keys (no UTC drift)", () => {
    const lateNight = new Date(2026, 3, 25, 23, 30, 0);
    const model = buildHeatmap(lateNight, [], []);
    const todayCell = model.cells.find((c) => c.state === "today");
    expect(todayCell?.date).toBe("2026-04-25");
  });

  it("marks days after lastComputedDate as stale (cache lag)", () => {
    const today = day("2026-04-25");
    const model = buildHeatmap(today, [], [], {
      startDate: "2026-04-01",
      lastComputedDate: "2026-04-23",
    });
    const apr24 = model.cells.find((c) => c.date === "2026-04-24");
    const apr25 = model.cells.find((c) => c.date === "2026-04-25");
    const apr23 = model.cells.find((c) => c.date === "2026-04-23");

    expect(apr24?.state).toBe("stale");
    // Today keeps the "today" state (ring wins; legend explains the gap).
    expect(apr25?.state).toBe("today");
    expect(apr23?.state).toBe("past");
  });

  it("does not mark a day stale when activity for that day exists", () => {
    const today = day("2026-04-25");
    const tokens: DailyTokens[] = [{ date: "2026-04-24", total: 500 }];
    const daily: DailyActivity[] = [
      { date: "2026-04-24", messageCount: 10, sessionCount: 1, toolCallCount: 0 },
    ];
    const model = buildHeatmap(today, daily, tokens, {
      startDate: "2026-04-01",
      lastComputedDate: "2026-04-23",
    });
    const apr24 = model.cells.find((c) => c.date === "2026-04-24");
    expect(apr24?.state).toBe("past");
    expect(apr24?.level).toBeGreaterThan(0);
  });

  it("exposes rangeStart and rangeEnd derived from the actual grid", () => {
    const today = day("2026-04-25");
    const model = buildHeatmap(today, [], [], { startDate: "2026-04-06" });
    expect(model.rangeEnd).toBe("2026-04-25");
    // Apr 6 is a Monday → start unchanged. weeks = 3.
    expect(model.rangeStart).toBe("2026-04-06");
    expect(model.weeks).toBe(3);
  });

  it("handles a multi-year span without capping or padding", () => {
    const today = day("2026-04-25");
    const model = buildHeatmap(today, [], [], { startDate: "2024-01-01" });
    // Jan 1 2024 is a Monday → start unchanged. End Sun Apr 26 2026.
    // Span = 847 days = 121 weeks. Pure derivation, no cap.
    expect(model.weeks).toBe(121);
    expect(model.rangeStart).toBe("2024-01-01");
    expect(model.cells).toHaveLength(121 * 7);
  });
});

describe("cutoffDaysForPeriod", () => {
  it("matches the period button labels exactly", () => {
    expect(cutoffDaysForPeriod("week")).toBe(7);
    expect(cutoffDaysForPeriod("month")).toBe(30);
    expect(cutoffDaysForPeriod("all")).toBe(Infinity);
  });
});

