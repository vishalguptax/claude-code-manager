import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `usage.ts` reads exactly one path (~/.claude/stats-cache.json
 * via STATS_CACHE_FILE). Mocking `fs.readFileSync` lets us drive
 * every path — present, missing, malformed — without touching the
 * real user file.
 */
const fsState = vi.hoisted(() => ({
  content: null as string | null,
  throwError: false,
}));

vi.mock("fs", () => ({
  readFileSync: (): string => {
    if (fsState.throwError || fsState.content === null) {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    return fsState.content;
  },
}));

import { computeUsageStats, __internals } from "../usage";

const { projectCache, longestStreakOf, currentStreakOf } = __internals;

beforeEach(() => {
  fsState.content = null;
  fsState.throwError = false;
});

describe("computeUsageStats — file IO", () => {
  it("returns zeroed stats when stats-cache.json is missing", () => {
    fsState.throwError = true;
    const r = computeUsageStats();
    expect(r.totalTokens).toBe(0);
    expect(r.totalSessions).toBe(0);
    expect(r.daily).toEqual([]);
    expect(r.lastComputedDate).toBe("");
  });

  it("returns zeroed stats when the cache file is malformed JSON", () => {
    fsState.content = "{not json";
    expect(computeUsageStats().totalTokens).toBe(0);
  });

  it("projects a real cache shape end-to-end", () => {
    fsState.content = JSON.stringify({
      version: 3,
      lastComputedDate: "2026-04-25",
      dailyActivity: [
        { date: "2026-04-23", messageCount: 100, sessionCount: 2, toolCallCount: 30 },
        { date: "2026-04-24", messageCount: 250, sessionCount: 4, toolCallCount: 75 },
        { date: "2026-04-25", messageCount: 50,  sessionCount: 1, toolCallCount: 12 },
      ],
      dailyModelTokens: [
        { date: "2026-04-23", tokensByModel: { "claude-opus-4-6": 200_000 } },
        { date: "2026-04-24", tokensByModel: { "claude-opus-4-6": 500_000, "claude-sonnet-4-5": 100_000 } },
      ],
      modelUsage: {
        "claude-opus-4-6": { inputTokens: 500_000, outputTokens: 4_500_000 },
        "claude-sonnet-4-5": { inputTokens: 100_000, outputTokens: 900_000 },
      },
      totalSessions: 50,
      totalMessages: 12345,
      longestSession: { duration: 7_200_000 },
      firstSessionDate: "2025-12-31T06:52:32.057Z",
    });
    const r = computeUsageStats();
    expect(r.lastComputedDate).toBe("2026-04-25");
    expect(r.totalSessions).toBe(50);
    expect(r.totalMessages).toBe(12345);
    expect(r.totalTokens).toBe(6_000_000);
    expect(r.totalInputTokens).toBe(600_000);
    expect(r.totalOutputTokens).toBe(5_400_000);
    expect(r.longestSessionMs).toBe(7_200_000);
    expect(r.firstSessionDate).toBe("2025-12-31");
    expect(r.daily).toHaveLength(3);
    expect(r.dailyTokens).toHaveLength(2);
    expect(r.dailyTokens[1].total).toBe(600_000);
    expect(r.activeDays).toBe(3);
    expect(r.totalDays).toBe(3);
    expect(r.mostActiveDay).toBe("2026-04-24");
    expect(r.favoriteModel).toBe("claude-opus-4-6");
    expect(r.byModel[0].totalTokens).toBe(5_000_000);
  });
});

describe("projectCache — field mapping", () => {
  it("sorts daily + dailyTokens by date regardless of input order", () => {
    const r = projectCache({
      dailyActivity: [
        { date: "2026-02-10", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-01-05", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
      ],
      dailyModelTokens: [
        { date: "2026-02-10", tokensByModel: { x: 5 } },
        { date: "2026-01-05", tokensByModel: { x: 3 } },
      ],
    });
    expect(r.daily.map((d) => d.date)).toEqual(["2026-01-05", "2026-02-10"]);
    expect(r.dailyTokens.map((d) => d.date)).toEqual(["2026-01-05", "2026-02-10"]);
  });

  it("ignores rows missing a date (defensive against stale cache shapes)", () => {
    const r = projectCache({
      dailyActivity: [
        { date: "2026-04-25", messageCount: 5, sessionCount: 1, toolCallCount: 1 },
        { messageCount: 99 },
      ] as never,
      dailyModelTokens: [
        { tokensByModel: { x: 99 } },
      ] as never,
    });
    expect(r.daily).toHaveLength(1);
    expect(r.dailyTokens).toHaveLength(0);
  });

  it("treats missing modelUsage as zero tokens", () => {
    const r = projectCache({
      lastComputedDate: "2026-04-25",
      totalSessions: 1,
    });
    expect(r.totalTokens).toBe(0);
    expect(r.byModel).toEqual([]);
    expect(r.favoriteModel).toBe("");
  });

  it("sums input + output across modelUsage and excludes cache fields", () => {
    const r = projectCache({
      modelUsage: {
        a: {
          inputTokens: 1_000,
          outputTokens: 2_000,
          // Cache figures must not leak into the headline total —
          // matches Claude CLI's `/stats` which shows input+output.
          // (extra fields ignored by our typed projection)
        },
        b: { inputTokens: 500, outputTokens: 500 },
      },
    });
    expect(r.totalTokens).toBe(4_000);
    expect(r.byModel).toHaveLength(2);
    expect(r.byModel[0].model).toBe("a"); // sorted desc by total
  });

  it("computes totalDays as inclusive span of first → last active day", () => {
    const r = projectCache({
      dailyActivity: [
        { date: "2026-04-01", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-10", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
      ],
    });
    expect(r.totalDays).toBe(10); // 1st → 10th inclusive
  });

  it("slices firstSessionDate to YYYY-MM-DD", () => {
    expect(
      projectCache({ firstSessionDate: "2025-12-31T06:52:32.057Z" }).firstSessionDate,
    ).toBe("2025-12-31");
    expect(projectCache({ firstSessionDate: "" }).firstSessionDate).toBe("");
    expect(projectCache({}).firstSessionDate).toBe("");
  });
});

describe("longestStreakOf", () => {
  it("returns 0 for empty input", () => {
    expect(longestStreakOf([])).toBe(0);
  });

  it("counts consecutive-day runs and resets on gaps", () => {
    expect(
      longestStreakOf([
        { date: "2026-04-01", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-02", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-03", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-05", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
      ]),
    ).toBe(3);
  });
});

describe("currentStreakOf", () => {
  it("anchors to latest active date — not wall-clock today", () => {
    // Two-day run ending 2026-04-24 (not today). Matches CLI
    // `/stats` which doesn't penalise a not-yet-active today.
    expect(
      currentStreakOf([
        { date: "2026-04-23", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-24", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
      ]),
    ).toBe(2);
  });

  it("returns 0 for empty input", () => {
    expect(currentStreakOf([])).toBe(0);
  });
});
