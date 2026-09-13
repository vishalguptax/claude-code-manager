// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountData, UsageStats } from "../../../types";
import { setVscodeApi } from "../../../../../webview/shared/hooks";
import { _resetAccountState, timePeriod } from "../../model";
import { UsageView } from "./UsageView";

function makeUsage(over: Partial<UsageStats> = {}): UsageStats {
  return {
    daily: [{ date: "2026-05-20", messageCount: 4, sessionCount: 2, toolCallCount: 8 }],
    dailyTokens: [{ date: "2026-05-20", total: 12_000 }],
    dailyOwnTokens: [{ date: "2026-05-20", total: 5_000 }],
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
    usageWarming: false,
  };
}

describe("UsageView", () => {
  beforeEach(() => _resetAccountState());

  it("renders the empty state when no activity recorded", () => {
    render(h(UsageView, { data: dataWith(makeUsage({ daily: [] })) }));
    expect(screen.getByText("No activity recorded")).toBeTruthy();
  });

  it("renders the stats grid and info ribbon", () => {
    render(h(UsageView, { data: dataWith(makeUsage()) }));
    expect(screen.getByText("tokens")).toBeTruthy();
    // Cache READ volume, not the hit rate — the rate is pinned in the
    // high 90s for any regular user and never moves.
    expect(screen.getByText("cache read")).toBeTruthy();
    // Ribbon collapses old meta rows into one line. Favorite + streak
    // become inline tokens, not full label/value rows.
    expect(screen.getByText(/Favorite:\s*Opus 4\.7/)).toBeTruthy();
    expect(screen.getByText(/streak\s+1d/)).toBeTruthy();
  });

  it("puts Share in the section header, not on a row of its own", () => {
    // It used to sit right-aligned between the stat tiles and the info
    // ribbon — an action floating mid-column, attached to nothing.
    const { container } = render(h(UsageView, { data: dataWith(makeUsage()) }));
    const header = container.querySelector(".acct-section-header") as HTMLElement;
    expect(header.querySelector('[aria-label="Share stats"]')).toBeTruthy();
    expect(container.querySelector(".acct-share-row")).toBeNull();
  });

  it("does not offer Share when there is nothing to share", () => {
    const { container } = render(h(UsageView, { data: dataWith(makeUsage({ daily: [] })) }));
    expect(container.querySelector('[aria-label="Share stats"]')).toBeNull();
  });

  it("renders a PNG and posts saveStatsImage (prefix stripped) on click", () => {
    const post = vi.fn();
    setVscodeApi({ postMessage: post });
    // happy-dom's canvas is a no-op, so stub the 2d context + toDataURL to
    // drive the click path deterministically.
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({
        fillRect: vi.fn(),
        fillText: vi.fn(),
      } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,QUJD");

    render(h(UsageView, { data: dataWith(makeUsage()) }));
    fireEvent.click(screen.getByLabelText("Share stats"));

    expect(post).toHaveBeenCalledWith({ type: "saveStatsImage", pngBase64: "QUJD" });

    getContext.mockRestore();
    toDataURL.mockRestore();
    setVscodeApi(null);
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
    expect(screen.getByText(/Cost\s+&\s+models/)).toBeTruthy();
    // Labelled as an API-rate projection, not a bill: subscription
    // users owe a flat fee and none of this number.
    expect(screen.getByText("If billed via API")).toBeTruthy();
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
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText("Tools")).toBeTruthy();
    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(screen.getByText("github: create_issue")).toBeTruthy();
  });

  it("collapses the usage section when its header is toggled", () => {
    render(h(UsageView, { data: dataWith(makeUsage()) }));
    const header = screen.getByText("Usage").closest(".acct-section-header") as HTMLElement;
    fireEvent.click(header);
    // Collapsed → stats grid gone.
    expect(screen.queryByText("tokens")).toBeNull();
  });

  describe("breakdown blocks fold away", () => {
    /** Usage with every breakdown populated, so all four blocks render. */
    const withBreakdowns = () =>
      makeUsage({
        byModel: [
          {
            model: "claude-opus-4-7",
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            costUsd: 1.5,
          },
        ],
        byProject: [
          { path: "/a", slug: "a", sessions: 1, messages: 2, tokens: 30, costUsd: 1, lastActiveDate: "2026-05-20" },
          { path: "/b", slug: "b", sessions: 1, messages: 2, tokens: 20, costUsd: 1, lastActiveDate: "2026-05-20" },
        ],
        byTool: [{ name: "Bash", count: 4 }],
        byMcpServer: [{ server: "github", toolCount: 5, uniqueTools: 1 }],
      });

    it("shows a row count on each heading so a folded block still says what is in it", () => {
      const { container } = render(h(UsageView, { data: dataWith(withBreakdowns()) }));
      const heads = Array.from(container.querySelectorAll(".acct-block-head"));
      expect(heads.length).toBeGreaterThan(0);
      for (const head of heads) {
        expect(head.querySelector(".acct-block-count")?.textContent).toMatch(/^\d+$/);
        expect(head.getAttribute("aria-expanded")).toBe("true");
      }
    });

    it("hides a block's body when its heading is clicked, and remembers it", () => {
      const { container } = render(h(UsageView, { data: dataWith(withBreakdowns()) }));
      const head = container.querySelector(".acct-block-head") as HTMLElement;
      const block = head.parentElement as HTMLElement;
      const before = block.childElementCount;

      fireEvent.click(head);
      expect(head.getAttribute("aria-expanded")).toBe("false");
      expect(block.childElementCount).toBeLessThan(before);
      // The heading itself survives — a folded block is still navigable.
      expect(block.querySelector(".acct-block-head")).toBeTruthy();

      fireEvent.click(head);
      expect(head.getAttribute("aria-expanded")).toBe("true");
      expect(block.childElementCount).toBe(before);
    });

    it("is reachable from the keyboard", () => {
      const { container } = render(h(UsageView, { data: dataWith(withBreakdowns()) }));
      const head = container.querySelector(".acct-block-head") as HTMLElement;
      // A real <button>, so Enter/Space come free — no role/tabindex shim.
      expect(head.tagName).toBe("BUTTON");
    });
  });
});
