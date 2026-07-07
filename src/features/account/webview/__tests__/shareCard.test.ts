import { describe, expect, it } from "vitest";
import type { UsageStats } from "../../types";
import {
  buildShareCard,
  SHARE_CARD_FOOTER,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from "../lib/shareCard";

function makeUsage(over: Partial<UsageStats> = {}): UsageStats {
  return {
    daily: [
      { date: "2026-07-06", messageCount: 4, sessionCount: 2, toolCallCount: 8 },
      { date: "2026-07-07", messageCount: 6, sessionCount: 3, toolCallCount: 12 },
    ],
    dailyTokens: [
      { date: "2026-07-06", total: 12_000 },
      { date: "2026-07-07", total: 1_400_000 },
    ],
    activeDays: 2,
    totalDays: 2,
    mostActiveDay: "2026-07-07",
    longestStreak: 5,
    currentStreak: 3,
    byModel: [],
    favoriteModel: "claude-sonnet-4-5-20250929",
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 1_412_000,
    totalSessions: 1234,
    totalMessages: 10,
    longestSessionMs: 0,
    firstSessionDate: "2026-07-06",
    lastComputedDate: "2026-07-07",
    totalCostUsd: 0,
    pricesEffectiveDate: "2026-01-01",
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    cacheHitRatio: 0,
    byProject: [],
    byTool: [],
    byMcpServer: [],
    ...over,
  };
}

// Fixed anchor so the heatmap window is deterministic.
const TODAY = new Date("2026-07-07T12:00:00");

describe("buildShareCard", () => {
  it("stamps the fixed dimensions, title, and footer", () => {
    const card = buildShareCard(makeUsage(), TODAY);
    expect(card.width).toBe(SHARE_CARD_WIDTH);
    expect(card.height).toBe(SHARE_CARD_HEIGHT);
    expect(card.title).toBe("My Claude Code year");
    expect(card.footer).toBe(SHARE_CARD_FOOTER);
  });

  it("formats the headline from all-time totals via formatNumber", () => {
    const card = buildShareCard(makeUsage(), TODAY);
    // 1234 sessions → "1.2K"; 1,412,000 tokens → "1.4M".
    expect(card.headline).toBe("1.2K sessions · 1.4M tokens");
  });

  it("builds the subline with streak + fav (fav name via formatModelName)", () => {
    const card = buildShareCard(makeUsage(), TODAY);
    expect(card.subline).toBe("🔥 3-day streak · fav: Sonnet 4.5");
  });

  it("omits the streak segment when currentStreak is 0", () => {
    const card = buildShareCard(makeUsage({ currentStreak: 0 }), TODAY);
    expect(card.subline).toBe("fav: Sonnet 4.5");
  });

  it("omits the fav segment when there is no favoriteModel", () => {
    const card = buildShareCard(makeUsage({ favoriteModel: "" }), TODAY);
    expect(card.subline).toBe("🔥 3-day streak");
  });

  it("returns a null subline when both segments are omitted", () => {
    const card = buildShareCard(makeUsage({ currentStreak: 0, favoriteModel: "" }), TODAY);
    expect(card.subline).toBeNull();
  });

  it("builds a 52-week heatmap with cells and the recorded activity present", () => {
    const card = buildShareCard(makeUsage(), TODAY);
    expect(card.heatmap.weeks).toBeGreaterThanOrEqual(52);
    expect(card.heatmap.cells.length).toBe(card.heatmap.weeks * 7);
    // The heaviest day (1.4M tokens) should land at the top intensity level.
    const busiest = card.heatmap.cells.find((c) => c.date === "2026-07-07");
    expect(busiest).toBeDefined();
    expect(busiest?.level).toBe(4);
    // A quiet day still parses to a cell but a lower level.
    const quiet = card.heatmap.cells.find((c) => c.date === "2026-07-06");
    expect(quiet?.tokens).toBe(12_000);
  });
});
