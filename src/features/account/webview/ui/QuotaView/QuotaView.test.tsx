// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaSuccess } from "../../../quota";
import type { AccountApi } from "../../api";
import {
  _resetAccountState,
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
    capturedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  },
  live: {
    model: "Opus 4.6",
    contextUsedPercent: 3,
    contextSize: 1_000_000,
    sessionCostUsd: 0.97,
    linesAdded: 1,
    linesRemoved: 2,
    version: "2.1.86",
    capturedAt: new Date().toISOString(),
  },
};

describe("QuotaView", () => {
  beforeEach(() => _resetAccountState());

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
});
