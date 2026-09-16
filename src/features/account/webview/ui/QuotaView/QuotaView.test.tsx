// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaSuccess } from "../../../quota";
import type { AccountData } from "../../../types";
import type { AccountApi } from "../../api";
import {
  _resetAccountState,
  accountData,
  quotaAccountSince,
  setQuotaError,
  setQuotaLoading,
  setQuotaSuccess,
} from "../../model";
import { QuotaView } from "./QuotaView";

function stubApi(): AccountApi {
  return {
    getAccountData: vi.fn(),
    launchSlash: vi.fn(),
    setModel: vi.fn(),
    setVoiceEnabled: vi.fn(),
    setCommitAttribution: vi.fn(),
    setPrAttribution: vi.fn(),
    openSettingsFile: vi.fn(),
    removePermission: vi.fn(),
    promptAddPermission: vi.fn(),
    restoreClaudeConfig: vi.fn(),
    fetchQuota: vi.fn(),
    installStatusline: vi.fn(),
    uninstallStatusline: vi.fn(),
    promptSaveProfile: vi.fn(),
    openAccountSwitcher: vi.fn(),
    saveStatsImage: vi.fn(),
  };
}

const SUCCESS: QuotaSuccess = {
  quota: {
    fiveHour: { utilization: 42, resetsAt: "" },
    sevenDay: { utilization: 75, resetsAt: "" },
    spendLimit: null,
    capturedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  },
  live: {
    model: "Opus 4.6",
    contextUsedPercent: 3,
    contextSize: 1_000_000,
    contextTokens: null,
    sessionCostUsd: 0.97,
    linesAdded: 1,
    linesRemoved: 2,
    version: "2.1.86",
    sessionName: "",
    capturedAt: new Date().toISOString(),
    promptCache: null,
  },
};

describe("QuotaView", () => {
  beforeEach(() => _resetAccountState());

  it("projects the weekly bar only, never the 5-hour one", () => {
    // Half the week gone with three quarters spent: overrunning, and the
    // only window where that projection means anything.
    const captured = new Date();
    const halfWeekOut = new Date(captured.getTime() + 3.5 * 86400000).toISOString();
    setQuotaSuccess({
      ...SUCCESS,
      quota: {
        ...SUCCESS.quota,
        fiveHour: { utilization: 42, resetsAt: halfWeekOut },
        sevenDay: { utilization: 75, resetsAt: halfWeekOut },
        spendLimit: null,
        capturedAt: captured.toISOString(),
      },
    });
    // One projection only — the 5-hour bar never gets one.
    const { container } = render(h(QuotaView, { api: stubApi() }));
    expect(container.querySelectorAll(".acct-quota-bar-ghost")).toHaveLength(1);
    expect(screen.getByText(/^out in /)).toBeTruthy();
  });

  it("draws no projection in the first hours of a window", () => {
    const captured = new Date();
    // Six hours in: one session divides out to a nonsense projection.
    const nearlyAWeekOut = new Date(captured.getTime() + 7 * 86400000 - 6 * 3600000).toISOString();
    setQuotaSuccess({
      ...SUCCESS,
      quota: {
        ...SUCCESS.quota,
        sevenDay: { utilization: 6, resetsAt: nearlyAWeekOut },
        spendLimit: null,
        capturedAt: captured.toISOString(),
      },
    });
    const { container } = render(h(QuotaView, { api: stubApi() }));
    expect(container.querySelector(".acct-quota-bar-ghost")).toBeNull();
    expect(container.querySelector(".acct-quota-countdown")).toBeNull();
  });

  it("not-installed state shows the enable CTA and installs on click", () => {
    setQuotaError({ kind: "not-installed", message: "enable it" });
    const api = stubApi();
    render(h(QuotaView, { api }));
    fireEvent.click(screen.getByText(/Enable live quota/));
    expect(api.installStatusline).toHaveBeenCalled();
  });

  it("loading state shows the spinner label", () => {
    setQuotaLoading();
    render(h(QuotaView, { api: stubApi() }));
    expect(screen.getByText(/Reading quota/)).toBeTruthy();
  });

  it("success state renders only the 5h and 7d bars", () => {
    setQuotaSuccess(SUCCESS);
    render(h(QuotaView, { api: stubApi() }));
    expect(screen.getByText("5-hour window")).toBeTruthy();
    expect(screen.getByText("7-day window")).toBeTruthy();
    expect(screen.queryByText("7-day Opus")).toBeNull();
    expect(screen.queryByText("7-day Sonnet")).toBeNull();
    expect(screen.getAllByRole("progressbar").length).toBe(2);
  });

  it("captions a fresh capture with 'Updated …' (never a bare, unexplained number)", () => {
    setQuotaSuccess(SUCCESS); // capturedAt = now
    render(h(QuotaView, { api: stubApi() }));
    expect(screen.getByText(/^Updated/)).toBeTruthy();
    // Fresh capture — no "refreshes when Claude Code runs" hint yet.
    expect(screen.queryByText(/refreshes when Claude Code runs/)).toBeNull();
  });

  it("marks a stale capture with the idle (muted) status dot, still stamped in the header", () => {
    setQuotaSuccess({
      ...SUCCESS,
      quota: { ...SUCCESS.quota, capturedAt: new Date(Date.now() - 60 * 60_000).toISOString() },
    });
    render(h(QuotaView, { api: stubApi() }));
    const dot = screen.getByTitle(/Idle · last render/);
    expect(dot.classList.contains("is-stale")).toBe(true);
    // The capture age still shows in the header stamp; the "refreshes when
    // Claude runs" nuance now rides the dot's tooltip, not body text.
    expect(screen.getByText(/^Updated/)).toBeTruthy();
  });

  it("no-data state shows the hint and refreshes on click", () => {
    setQuotaError({ kind: "no-data", message: "open a session first" });
    const api = stubApi();
    render(h(QuotaView, { api }));
    expect(screen.getByText("open a session first")).toBeTruthy();
    fireEvent.click(screen.getByText(/Refresh/));
    expect(api.fetchQuota).toHaveBeenCalled();
  });

  it("the header refresh button re-reads without tearing down the bars", () => {
    setQuotaSuccess(SUCCESS);
    const api = stubApi();
    render(h(QuotaView, { api }));
    fireEvent.click(screen.getByLabelText("Re-read latest quota"));
    expect(api.fetchQuota).toHaveBeenCalled();
    // No flicker: with data already shown, re-read keeps the bars in place
    // instead of swapping to the "Reading quota" spinner. The numbers are
    // replaced when the reply lands.
    expect(screen.getByText("5-hour window")).toBeTruthy();
    expect(screen.queryByText(/Reading quota/)).toBeNull();
  });

  it("shows a live status dot (in the header) for a fresh capture", () => {
    setQuotaSuccess(SUCCESS);
    render(h(QuotaView, { api: stubApi() }));
    const dot = screen.getByTitle(/Live · last render/);
    expect(dot).toBeTruthy();
    expect(dot.classList.contains("is-stale")).toBe(false);
    // No bottom caption anymore — freshness lives only in the header dot.
    expect(screen.queryByText(/last render/)).toBeNull();
  });

  it("suppresses a capture that predates an account switch", () => {
    // Capture taken before the switch belongs to the previous account
    // (global cache, no account id) → show the switched notice, not bars.
    const stale: QuotaSuccess = {
      ...SUCCESS,
      quota: {
        ...SUCCESS.quota,
        capturedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
    };
    setQuotaSuccess(stale);
    quotaAccountSince.value = Date.now(); // switch happened just now
    const { container } = render(h(QuotaView, { api: stubApi() }));
    expect(screen.getByText("Switched account")).toBeTruthy();
    expect(screen.queryByText("5-hour window")).toBeNull();
    // No live dot while suppressed.
    expect(container.querySelector(".acct-quota-live-dot")).toBeNull();
  });

  it("falls back to the account's last remembered figure after a switch", () => {
    // The live cache belongs to the account we left, so there is nothing
    // current for this one — but we know what it looked like when it was
    // last live, and that is the number the user just switched to find.
    setQuotaSuccess({
      ...SUCCESS,
      quota: { ...SUCCESS.quota, capturedAt: new Date(Date.now() - 5 * 60_000).toISOString() },
    });
    quotaAccountSince.value = Date.now();
    // Only the two fields this path reads; the rest of AccountData is
    // irrelevant to the fallback and would be noise in the fixture.
    accountData.value = {
      activeProfileSlug: "work",
      savedProfiles: [
        {
          slug: "work",
          label: "Work",
          email: "alex@example.dev",
          organizationName: "",
          subscriptionType: "max",
          savedAt: "",
          tokenExpiresAt: 0,
          credentialsHash: "",
          userID: "",
          accountUuid: "uuid-work",
          lastQuota: {
            sevenDayPercent: 62,
            fiveHourPercent: 10,
            sevenDayResetsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
            capturedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
          },
        },
      ],
    } as unknown as AccountData;
    render(h(QuotaView, { api: stubApi() }));
    // Age is rendered off the shared clock signal (as every other live
    // stamp in this card is); the exact wording of the age is covered in
    // profileQuota's own tests.
    expect(screen.getByText(/Last seen 62% weekly/)).toBeTruthy();
  });

  it("says only that the account switched when nothing was remembered", () => {
    setQuotaSuccess({
      ...SUCCESS,
      quota: { ...SUCCESS.quota, capturedAt: new Date(Date.now() - 5 * 60_000).toISOString() },
    });
    quotaAccountSince.value = Date.now();
    render(h(QuotaView, { api: stubApi() }));
    expect(screen.getByText("Switched account")).toBeTruthy();
  });

  it("shows bars again once a capture lands after the switch", () => {
    quotaAccountSince.value = Date.now() - 60_000; // switched a minute ago
    const fresh: QuotaSuccess = {
      ...SUCCESS,
      quota: { ...SUCCESS.quota, capturedAt: new Date().toISOString() }, // after switch
    };
    setQuotaSuccess(fresh);
    render(h(QuotaView, { api: stubApi() }));
    expect(screen.getByText("5-hour window")).toBeTruthy();
    expect(screen.queryByText("Switched account")).toBeNull();
  });

  it("marks the header dot idle when the capture is stale", () => {
    const stale: QuotaSuccess = {
      ...SUCCESS,
      quota: {
        ...SUCCESS.quota,
        capturedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      },
    };
    setQuotaSuccess(stale);
    render(h(QuotaView, { api: stubApi() }));
    const dot = screen.getByTitle(/Idle · last render/);
    expect(dot.classList.contains("is-stale")).toBe(true);
  });

  describe("prompt cache row", () => {
    const withCache = (over: Record<string, unknown>): QuotaSuccess => ({
      ...SUCCESS,
      live: {
        ...SUCCESS.live,
        promptCache: {
          warm: true,
          ttl: "1h",
          requests: 40,
          misses: 4,
          expectedRebuilds: 2,
          hitRatio: 0.9,
          cacheWriteTokens: 12_000,
          missRecacheTokens: 1_500_000,
          // Mirrors the real payload: Claude reports the diagnosis as an
          // object, never a string. An earlier fixture used a string and
          // kept a permanently-blank UI line green.
          lastMissCause: {
            causes: ["tools_changed"],
            toolsAdded: 3,
            toolsRemoved: 0,
            systemCharDelta: 0,
          },
          cachingObserved: true,
          expiresAt: 1_789_545_600,
          lastMissAt: 1_789_540_000,
          missCauses: { tools_changed: 3, ttl_expired_1h: 1 },
          recacheTokensIfCold: 48_000,
          ...over,
        },
      },
    });

    it("renders the hit ratio, TTL and what the misses cost", () => {
      setQuotaSuccess(withCache({}));
      render(h(QuotaView, { api: stubApi() }));
      expect(screen.getByText("Prompt cache (1h)")).toBeTruthy();
      expect(screen.getByText("90% hit")).toBeTruthy();
      expect(
        screen.getByText("40 requests · 4 missed · 2 rebuilt · 1.5M tokens re-cached"),
      ).toBeTruthy();
    });

    it("stays out of the way while the cache is healthy", () => {
      // 98% is the ordinary case. A permanent row saying so is a constant
      // that carries no information and eats the bottom of the card.
      setQuotaSuccess(withCache({ hitRatio: 0.98 }));
      const { container } = render(h(QuotaView, { api: stubApi() }));
      expect(container.querySelector(".acct-quota-cache")).toBeNull();
      // The bars it annotates are untouched.
      expect(screen.getByText("7-day window")).toBeTruthy();
    });

    it("glosses the jargon behind a visible info icon", () => {
      // "hit", "missed" and "re-cached" mean nothing on their own, and the
      // figure is only actionable once the reader knows which direction is
      // good — the opposite of the quota bars right above it.
      setQuotaSuccess(withCache({}));
      const { container } = render(h(QuotaView, { api: stubApi() }));
      const info = container.querySelector(".acct-quota-cache .acct-quota-info") as HTMLElement;
      expect(info.getAttribute("title")).toContain("Higher is cheaper");
      // The diagnosis is glossed into plain language, and tool churn
      // carries its count because that one is actionable (usually an
      // MCP server connecting or dropping mid-session).
      expect(info.getAttribute("title")).toContain(
        "Last miss: the tool set changed (+3 tools).",
      );
    });

    it("omits the last-miss clause when Claude diagnosed no cause", () => {
      setQuotaSuccess(withCache({ lastMissCause: null }));
      const { container } = render(h(QuotaView, { api: stubApi() }));
      const info = container.querySelector(".acct-quota-cache .acct-quota-info") as HTMLElement;
      expect(info.getAttribute("title")).toContain("Higher is cheaper");
      expect(info.getAttribute("title")).not.toContain("Last miss:");
    });

    it("renders an unknown cause name verbatim rather than dropping it", () => {
      // The cause set grows across Claude Code releases; a name we have
      // no phrase for must still reach the user.
      setQuotaSuccess(
        withCache({
          lastMissCause: {
            causes: ["some_future_cause"],
            toolsAdded: 0,
            toolsRemoved: 0,
            systemCharDelta: 0,
          },
        }),
      );
      const { container } = render(h(QuotaView, { api: stubApi() }));
      const info = container.querySelector(".acct-quota-cache .acct-quota-info") as HTMLElement;
      expect(info.getAttribute("title")).toContain("Last miss: some future cause.");
    });

    it("joins multiple causes reported for one miss", () => {
      setQuotaSuccess(
        withCache({
          lastMissCause: {
            causes: ["model_changed", "ttl_expired_1h"],
            toolsAdded: 0,
            toolsRemoved: 0,
            systemCharDelta: 0,
          },
        }),
      );
      const { container } = render(h(QuotaView, { api: stubApi() }));
      const info = container.querySelector(".acct-quota-cache .acct-quota-info") as HTMLElement;
      expect(info.getAttribute("title")).toContain(
        "Last miss: the model changed and the 1h cache expired.",
      );
    });

    it("renders nothing until Claude has reported a request", () => {
      setQuotaSuccess(SUCCESS);
      const { container } = render(h(QuotaView, { api: stubApi() }));
      expect(container.querySelector(".acct-quota-cache")).toBeNull();

      _resetAccountState();
      setQuotaSuccess(withCache({ requests: 0 }));
      const zero = render(h(QuotaView, { api: stubApi() }));
      expect(zero.container.querySelector(".acct-quota-cache")).toBeNull();
    });

    it("omits the segments Claude did not report", () => {
      // Misses without a rebuild count or a re-cache figure: the detail
      // line carries what exists and nothing else, rather than padding
      // itself out with zeroes.
      setQuotaSuccess(
        withCache({ misses: 8, expectedRebuilds: 0, missRecacheTokens: 0, hitRatio: 0.8 }),
      );
      render(h(QuotaView, { api: stubApi() }));
      expect(screen.getByText("40 requests · 8 missed")).toBeTruthy();
      expect(screen.getByText("80% hit")).toBeTruthy();
    });
  });
});
