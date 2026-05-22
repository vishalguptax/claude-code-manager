// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { beforeEach, describe, expect, it } from "vitest";
import type { AccountData, UsageStats } from "../../../types";
import { _resetAccountState, timePeriod } from "../../model";
import { UsageView } from "./UsageView";

function makeUsage(over: Partial<UsageStats> = {}): UsageStats {
  return {
    daily: [{ date: "2026-05-20", messageCount: 4, sessionCount: 2, toolCallCount: 8 }],
    dailyTokens: [{ date: "2026-05-20", total: 12_000 }],
    activeDays: 1,
    totalDays: 1,
    mostActiveDay: "2026-05-20",
    longestStreak: 3,
    currentStreak: 1,
    byModel: [],
    favoriteModel: "claude-opus-4-7",
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 12_000,
    totalSessions: 2,
    totalMessages: 4,
    longestSessionMs: 0,
    firstSessionDate: "2026-05-20",
    lastComputedDate: "2026-05-20",
    totalCostUsd: 0,
    pricesEffectiveDate: "2026-01-01",
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    cacheHitRatio: 0.5,
    byProject: [],
    byTool: [],
    byMcpServer: [],
    ...over,
  };
}

function dataWith(usage: UsageStats): AccountData {
  return {
    profile: {} as AccountData["profile"],
    usage,
    settings: {} as AccountData["settings"],
    permissions: [],
    availableModels: [],
    savedProfiles: [],
    activeProfileSlug: null,
    settingsSnapshots: [],
  };
}

describe("UsageView", () => {
  beforeEach(() => _resetAccountState());

  it("renders the empty state when no activity recorded", () => {
    render(h(UsageView, { data: dataWith(makeUsage({ daily: [] })) }));
    expect(screen.getByText("No activity recorded")).toBeTruthy();
  });

  it("renders the stats grid and meta rows", () => {
    render(h(UsageView, { data: dataWith(makeUsage()) }));
    expect(screen.getByText("tokens")).toBeTruthy();
    expect(screen.getByText("cache hit")).toBeTruthy();
    expect(screen.getByText("Favorite model")).toBeTruthy();
    expect(screen.getByText("Opus 4.7")).toBeTruthy();
    expect(screen.getByText("Current streak")).toBeTruthy();
  });

  it("switches the time period when a toggle is clicked", () => {
    render(h(UsageView, { data: dataWith(makeUsage()) }));
    fireEvent.click(screen.getByText("All time"));
    expect(timePeriod.value).toBe("all");
  });

  it("renders the by-model group with a cost total", () => {
    const usage = makeUsage({
      byModel: [
        {
          model: "claude-opus-4-7",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 9000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          costUsd: 1.5,
        },
        {
          model: "claude-sonnet-4-5",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 3000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          costUsd: 0.2,
        },
      ],
      totalCostUsd: 1.7,
    });
    render(h(UsageView, { data: dataWith(usage) }));
    expect(screen.getByText("By model (all time)")).toBeTruthy();
    expect(screen.getByText("Total est. cost")).toBeTruthy();
  });

  it("renders the projects, tools, and MCP breakdowns", () => {
    const usage = makeUsage({
      byProject: [
        {
          path: "/a/proj-one",
          slug: "p1",
          sessions: 3,
          messages: 9,
          tokens: 5000,
          costUsd: 0.5,
          lastActiveDate: "2026-05-20",
        },
        {
          path: "/a/proj-two",
          slug: "p2",
          sessions: 1,
          messages: 2,
          tokens: 1000,
          costUsd: 0,
          lastActiveDate: "2026-05-19",
        },
      ],
      byTool: [
        { name: "Read", count: 40 },
        { name: "mcp__github__create_issue", count: 5 },
      ],
      byMcpServer: [{ server: "github", toolCount: 5, uniqueTools: 1 }],
    });
    render(h(UsageView, { data: dataWith(usage) }));
    expect(screen.getByText(/By project/)).toBeTruthy();
    expect(screen.getByText(/Tools/)).toBeTruthy();
    expect(screen.getByText("MCP servers used")).toBeTruthy();
    expect(screen.getByText("github: create_issue")).toBeTruthy();
  });

  it("collapses the usage section when its header is toggled", () => {
    render(h(UsageView, { data: dataWith(makeUsage()) }));
    const header = screen.getByText("Usage").closest(".acct-section-header") as HTMLElement;
    fireEvent.click(header);
    // Collapsed → stats grid gone.
    expect(screen.queryByText("tokens")).toBeNull();
  });
});
