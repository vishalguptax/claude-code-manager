import { describe, expect, it } from "vitest";
import type { AccountData, UsageStats } from "../../types";
import {
  accountKey,
  cacheHitTooltip,
  computeUsageTotals,
  currencyFractionDigits,
  displayToolName,
  formatDuration,
  formatFetchedRelative,
  formatModelName,
  formatMoney,
  formatNumber,
  formatPct,
  formatResetsIn,
  quotaTone,
  shortenProjectPath,
} from "./format";

describe("formatNumber", () => {
  it("formats millions and thousands", () => {
    expect(formatNumber(2_500_000)).toBe("2.5M");
    expect(formatNumber(12_300)).toBe("12.3K");
  });
  it("uses locale string under 1000", () => {
    expect(formatNumber(999)).toBe("999");
  });
});

describe("formatPct", () => {
  it("rounds a ratio to percent", () => {
    expect(formatPct(0.834)).toBe("83%");
  });
  it("falls back to em-dash for zero / non-finite", () => {
    expect(formatPct(0)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("includes days when present", () => {
    expect(formatDuration(90_061_000)).toBe("1d 1h 1m");
  });
  it("drops days when under 24h", () => {
    expect(formatDuration(3_660_000)).toBe("1h 1m");
  });
  it("shows minutes only when under an hour", () => {
    expect(formatDuration(120_000)).toBe("2m");
  });
});

describe("formatModelName", () => {
  it("shortens a versioned claude id", () => {
    expect(formatModelName("claude-sonnet-4-5-20250929")).toBe("Sonnet 4.5");
  });
  it("handles single-segment versions", () => {
    expect(formatModelName("claude-opus-4")).toBe("Opus 4");
  });
  it("returns the input verbatim when it doesn't match", () => {
    expect(formatModelName("gpt-4o")).toBe("gpt-4o");
  });
});

describe("currencyFractionDigits", () => {
  it("returns 0 for zero-decimal currencies", () => {
    expect(currencyFractionDigits("JPY")).toBe(0);
  });
  it("returns 3 for three-decimal currencies", () => {
    expect(currencyFractionDigits("BHD")).toBe(3);
  });
  it("defaults to 2", () => {
    expect(currencyFractionDigits("USD")).toBe(2);
  });
});

describe("formatMoney", () => {
  it("converts AUD minor units to major before formatting", () => {
    // 23346 cents → 233.46 AUD (not 23346.00).
    const out = formatMoney(23346, "AUD");
    expect(out).toContain("233.46");
  });
  it("respects zero-decimal currencies", () => {
    const out = formatMoney(1500, "JPY");
    expect(out).not.toContain(".");
  });
  it("still renders the major amount for an unusual code", () => {
    // Intl accepts well-formed 3-letter codes and renders the code as
    // the symbol (e.g. "ZZZ 10.00"); either way the major amount shows.
    expect(formatMoney(1000, "ZZZ")).toContain("10.00");
  });
});

describe("formatResetsIn", () => {
  it("returns empty for blank / invalid input", () => {
    expect(formatResetsIn("")).toBe("");
    expect(formatResetsIn("not-a-date")).toBe("");
  });
  it("formats days, hours, minutes", () => {
    const inDays = new Date(Date.now() + 2 * 86400000 + 3 * 3600000).toISOString();
    expect(formatResetsIn(inDays)).toMatch(/^resets in 2d/);
    const inHours = new Date(Date.now() + 3 * 3600000 + 5 * 60000).toISOString();
    expect(formatResetsIn(inHours)).toMatch(/^resets in 3h/);
    const inMins = new Date(Date.now() + 10 * 60000).toISOString();
    expect(formatResetsIn(inMins)).toMatch(/^resets in 1[01]m/);
  });
  it("says resets now for a past time", () => {
    expect(formatResetsIn(new Date(Date.now() - 1000).toISOString())).toBe("resets now");
  });
});

describe("formatFetchedRelative", () => {
  it("returns just now for very recent / invalid", () => {
    expect(formatFetchedRelative("bad")).toBe("just now");
    expect(formatFetchedRelative(new Date().toISOString())).toBe("just now");
  });
  it("formats minutes and hours ago", () => {
    expect(formatFetchedRelative(new Date(Date.now() - 5 * 60000).toISOString())).toBe("5m ago");
    expect(formatFetchedRelative(new Date(Date.now() - 2 * 3600000).toISOString())).toBe("2h ago");
  });
});

describe("quotaTone", () => {
  it("maps utilization to tiers", () => {
    expect(quotaTone(90)).toBe("high");
    expect(quotaTone(60)).toBe("mid");
    expect(quotaTone(10)).toBe("low");
  });
});

describe("shortenProjectPath", () => {
  it("keeps the last two segments of a real path", () => {
    expect(shortenProjectPath("/home/me/projects/claude-manager")).toBe("projects/claude-manager");
    expect(shortenProjectPath("C:\\Users\\me\\app")).toBe("me/app");
  });
  it("falls back to slug tail", () => {
    expect(shortenProjectPath("C--Users-me-claude-manager")).toBe("me-claude-manager");
  });
  it("returns (unknown) for empty", () => {
    expect(shortenProjectPath("")).toBe("(unknown)");
  });
});

describe("displayToolName", () => {
  it("collapses MCP tool names to server: tool", () => {
    expect(displayToolName("mcp__github__create_issue")).toBe("github: create_issue");
  });
  it("returns built-in tool names verbatim", () => {
    expect(displayToolName("Read")).toBe("Read");
  });
});

function makeUsage(overrides: Partial<UsageStats> = {}): UsageStats {
  return {
    daily: [],
    dailyTokens: [],
    activeDays: 0,
    totalDays: 0,
    mostActiveDay: "",
    longestStreak: 0,
    currentStreak: 0,
    byModel: [],
    favoriteModel: "",
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalSessions: 0,
    totalMessages: 0,
    longestSessionMs: 0,
    firstSessionDate: "",
    lastComputedDate: "",
    totalCostUsd: 0,
    pricesEffectiveDate: "",
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    cacheHitRatio: 0,
    byProject: [],
    byTool: [],
    byMcpServer: [],
    ...overrides,
  };
}

describe("cacheHitTooltip", () => {
  it("explains no activity when nothing recorded", () => {
    expect(cacheHitTooltip(makeUsage())).toBe("No cache activity recorded yet.");
  });
  it("describes the cache math when present", () => {
    const u = makeUsage({
      totalCacheReadTokens: 1000,
      totalInputTokens: 3000,
      totalCacheCreationTokens: 200,
    });
    const out = cacheHitTooltip(u);
    expect(out).toContain("served from prompt cache");
    expect(out).toContain("Cache writes");
  });
});

describe("computeUsageTotals", () => {
  const u = makeUsage({
    daily: [
      { date: "2026-05-01", messageCount: 5, sessionCount: 2, toolCallCount: 9 },
      { date: "2026-05-20", messageCount: 3, sessionCount: 1, toolCallCount: 4 },
    ],
    dailyTokens: [
      { date: "2026-05-01", total: 1000 },
      { date: "2026-05-20", total: 2000 },
    ],
    totalDays: 30,
    totalSessions: 99,
    totalMessages: 88,
    totalTokens: 77_000,
  });

  it("uses lifetime totals for the all-time period", () => {
    const t = computeUsageTotals(u, "all");
    expect(t.sessions).toBe(99);
    expect(t.messages).toBe(88);
    expect(t.tokenTotal).toBe(77_000);
    expect(t.totalInPeriod).toBe(30);
  });

  it("filters to the recent window for week", () => {
    // Anchored to 2026-05-20; only that day is within 7 days.
    const t = computeUsageTotals(u, "week");
    expect(t.sessions).toBe(1);
    expect(t.messages).toBe(3);
    expect(t.tokenTotal).toBe(2000);
    expect(t.totalInPeriod).toBe(7);
    expect(t.activeInPeriod).toBe(1);
  });
});

describe("accountKey", () => {
  it("combines slug and email", () => {
    const data = {
      profile: { email: "a@b.com" },
      activeProfileSlug: "work",
    } as unknown as AccountData;
    expect(accountKey(data)).toBe("work|a@b.com");
  });
  it("handles a null slug", () => {
    const data = {
      profile: { email: "x@y.com" },
      activeProfileSlug: null,
    } as unknown as AccountData;
    expect(accountKey(data)).toBe("|x@y.com");
  });
});
