import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `computeUsageStats` now sources its payload from the JSONL
 * aggregator (`aggregateUsage`). We mock that module directly so tests
 * can drive every shape — populated, empty, or fallback-into-cache —
 * without juggling a virtual filesystem here.
 */
const aggState = vi.hoisted(() => ({
  result: null as unknown as ReturnType<
    typeof import("../projectStats").aggregateUsage
  > | null,
}));

vi.mock("../projectStats", () => ({
  aggregateUsage: () => aggState.result ?? emptyAggregate(),
  resetUsageAggregateCache: (): void => {
    /* noop in tests */
  },
  resetProjectStatsCache: (): void => {
    /* noop in tests */
  },
  aggregateProjectStats: () => aggState.result ?? emptyAggregate(),
}));

/**
 * stats-cache.json fallback path reads `STATS_CACHE_FILE` via
 * `fs.readFileSync`. The mock toggles between "missing", "malformed",
 * and "valid" content per test.
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
import type { UsageAggregate } from "../projectStats";

const {
  longestStreakOf,
  currentStreakOf,
  cacheHitRatioOf,
  mostActiveDayOf,
  spanDays,
} = __internals;

function emptyAggregate(): UsageAggregate {
  return {
    daily: [],
    dailyTokens: [],
    byModel: [],
    byProject: [],
    byTool: [],
    byMcpServer: [],
    totalSessions: 0,
    totalMessages: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    totalCostUsd: 0,
    longestSessionMs: 0,
    firstSessionDate: "",
  };
}

beforeEach(() => {
  aggState.result = null;
  fsState.content = null;
  fsState.throwError = false;
});

describe("computeUsageStats — JSONL primary", () => {
  it("returns zeroed stats when JSONL is empty AND cache is missing", () => {
    fsState.throwError = true;
    const r = computeUsageStats();
    expect(r.totalTokens).toBe(0);
    expect(r.daily).toEqual([]);
    expect(r.lastComputedDate).toBe("");
  });

  it("builds full stats from the aggregator when JSONL has data", () => {
    aggState.result = {
      ...emptyAggregate(),
      daily: [
        { date: "2026-05-09", messageCount: 5, sessionCount: 1, toolCallCount: 3 },
        { date: "2026-05-10", messageCount: 8, sessionCount: 2, toolCallCount: 4 },
        { date: "2026-05-11", messageCount: 12, sessionCount: 1, toolCallCount: 6 },
      ],
      dailyTokens: [
        { date: "2026-05-09", total: 1_000 },
        { date: "2026-05-10", total: 2_000 },
        { date: "2026-05-11", total: 3_000 },
      ],
      byModel: [
        {
          model: "claude-opus-4-7",
          inputTokens: 2_000,
          outputTokens: 4_000,
          totalTokens: 6_000,
          cacheReadTokens: 500,
          cacheCreationTokens: 100,
          costUsd: 0.5,
        },
      ],
      totalSessions: 3,
      totalMessages: 25,
      totalInputTokens: 2_000,
      totalOutputTokens: 4_000,
      totalTokens: 6_000,
      totalCacheReadTokens: 500,
      totalCacheCreationTokens: 100,
      totalCostUsd: 0.5,
      longestSessionMs: 3_600_000,
      firstSessionDate: "2026-05-09",
    };
    const r = computeUsageStats();
    expect(r.totalSessions).toBe(3);
    expect(r.totalMessages).toBe(25);
    expect(r.totalTokens).toBe(6_000);
    expect(r.totalCacheReadTokens).toBe(500);
    expect(r.cacheHitRatio).toBeCloseTo(500 / (500 + 2_000));
    expect(r.favoriteModel).toBe("claude-opus-4-7");
    expect(r.activeDays).toBe(3);
    expect(r.mostActiveDay).toBe("2026-05-11");
    expect(r.currentStreak).toBe(3);
    expect(r.longestStreak).toBe(3);
    // lastComputedDate points at the latest day so the heatmap doesn't
    // hatch fresh data as "stale".
    expect(r.lastComputedDate).toBe("2026-05-11");
  });

  it("falls back to stats-cache.json when JSONL is empty", () => {
    // JSONL aggregate is empty (default), cache holds legacy data.
    fsState.content = JSON.stringify({
      lastComputedDate: "2026-04-25",
      dailyActivity: [
        { date: "2026-04-24", messageCount: 10, sessionCount: 2, toolCallCount: 5 },
      ],
      modelUsage: {
        "claude-opus-4-6": { inputTokens: 1_000, outputTokens: 2_000 },
      },
      totalSessions: 7,
      totalMessages: 50,
    });
    const r = computeUsageStats();
    expect(r.totalSessions).toBe(7);
    expect(r.totalMessages).toBe(50);
    expect(r.totalTokens).toBe(3_000);
    expect(r.favoriteModel).toBe("claude-opus-4-6");
    expect(r.lastComputedDate).toBe("2026-04-25");
  });

  it("returns zeroed stats when cache JSON is malformed and JSONL is empty", () => {
    fsState.content = "{not json";
    expect(computeUsageStats().totalTokens).toBe(0);
  });

  it("merges cache history with JSONL gap-fill for recent days", () => {
    // Cache holds two days of lifetime history. JSONL aggregate has
    // one day that falls past the cache cutoff plus a totally new
    // model that the cache never saw.
    fsState.content = JSON.stringify({
      lastComputedDate: "2026-05-09",
      dailyActivity: [
        { date: "2026-05-08", messageCount: 4, sessionCount: 1, toolCallCount: 2 },
        { date: "2026-05-09", messageCount: 6, sessionCount: 1, toolCallCount: 3 },
      ],
      dailyModelTokens: [
        { date: "2026-05-08", tokensByModel: { "claude-opus-4-7": 500 } },
        { date: "2026-05-09", tokensByModel: { "claude-opus-4-7": 700 } },
      ],
      modelUsage: {
        "claude-opus-4-7": { inputTokens: 200, outputTokens: 1_000 },
      },
      totalSessions: 2,
      totalMessages: 10,
      firstSessionDate: "2026-05-08T00:00:00Z",
    });
    aggState.result = {
      ...emptyAggregate(),
      daily: [
        { date: "2026-05-09", messageCount: 99, sessionCount: 99, toolCallCount: 99 },
        { date: "2026-05-11", messageCount: 5, sessionCount: 1, toolCallCount: 2 },
      ],
      dailyTokens: [{ date: "2026-05-11", total: 300 }],
      byModel: [
        {
          model: "claude-sonnet-4-6",
          inputTokens: 50,
          outputTokens: 250,
          totalTokens: 300,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          costUsd: 0,
        },
      ],
      totalSessions: 1,
      totalMessages: 1,
      totalInputTokens: 50,
      totalOutputTokens: 250,
      totalTokens: 300,
      firstSessionDate: "2026-05-11",
      byProject: [
        {
          path: "p",
          slug: "p",
          sessions: 1,
          messages: 1,
          tokens: 300,
          costUsd: 0,
          lastActiveDate: "2026-05-11",
        },
      ],
      byTool: [{ name: "Read", count: 2 }],
    };
    const r = computeUsageStats();
    // Daily: cache rows kept, JSONL row past cutoff appended. The
    // duplicate "2026-05-09" from JSONL is ignored (cache wins).
    expect(r.daily.map((d) => d.date)).toEqual([
      "2026-05-08",
      "2026-05-09",
      "2026-05-11",
    ]);
    expect(r.daily.find((d) => d.date === "2026-05-09")?.messageCount).toBe(6);
    expect(r.daily.find((d) => d.date === "2026-05-11")?.messageCount).toBe(5);
    // byModel: cache model kept; JSONL-only model added.
    const opus = r.byModel.find((m) => m.model === "claude-opus-4-7")!;
    const sonnet = r.byModel.find((m) => m.model === "claude-sonnet-4-6")!;
    expect(opus.inputTokens).toBe(200);
    expect(sonnet.totalTokens).toBe(300);
    // Totals: sessions = cache + JSONL post-cutoff delta.
    expect(r.totalSessions).toBe(2 + 1);
    expect(r.totalMessages).toBe(10 + 5);
    // Breakdowns come from JSONL regardless of cutoff.
    expect(r.byProject).toHaveLength(1);
    expect(r.byTool[0].name).toBe("Read");
    // firstSessionDate = earlier of the two.
    expect(r.firstSessionDate).toBe("2026-05-08");
    // lastComputedDate advances past the JSONL day so the heatmap
    // stops hatching recent activity.
    expect(r.lastComputedDate).toBe("2026-05-11");
  });
});

describe("derivers", () => {
  it("longestStreakOf — counts consecutive-day runs and resets on gaps", () => {
    expect(
      longestStreakOf([
        { date: "2026-04-01", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-02", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-03", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-05", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
      ]),
    ).toBe(3);
  });

  it("longestStreakOf — empty input returns 0", () => {
    expect(longestStreakOf([])).toBe(0);
  });

  it("currentStreakOf — anchors to latest active date", () => {
    expect(
      currentStreakOf([
        { date: "2026-04-23", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-24", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
      ]),
    ).toBe(2);
  });

  it("currentStreakOf — empty input returns 0", () => {
    expect(currentStreakOf([])).toBe(0);
  });

  it("cacheHitRatioOf — input/cacheRead split", () => {
    expect(cacheHitRatioOf(500, 1_500)).toBeCloseTo(0.25);
    expect(cacheHitRatioOf(0, 0)).toBe(0);
    expect(cacheHitRatioOf(1_000, 0)).toBe(1);
  });

  it("mostActiveDayOf — picks the day with the most messages", () => {
    expect(
      mostActiveDayOf([
        { date: "2026-04-01", messageCount: 5, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-02", messageCount: 12, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-03", messageCount: 8, sessionCount: 1, toolCallCount: 0 },
      ]),
    ).toBe("2026-04-02");
  });

  it("spanDays — inclusive day span first → last", () => {
    expect(
      spanDays([
        { date: "2026-04-01", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
        { date: "2026-04-10", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
      ]),
    ).toBe(10);
    expect(spanDays([])).toBe(0);
  });
});
