// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaSuccess } from "../../../quota";
import type { AccountApi } from "../../api";
import { _resetAccountState, setQuotaError, setQuotaLoading, setQuotaSuccess } from "../../model";
import { QuotaView } from "./QuotaView";

function stubApi(): AccountApi {
  return {
    getAccountData: vi.fn(),
    openAccountUrl: vi.fn(),
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

  it("no-data state shows the hint and refreshes on click", () => {
    setQuotaError({ kind: "no-data", message: "open a session first" });
    const api = stubApi();
    render(h(QuotaView, { api }));
    expect(screen.getByText("open a session first")).toBeTruthy();
    fireEvent.click(screen.getByText(/Refresh/));
    expect(api.fetchQuota).toHaveBeenCalled();
  });

  it("the header refresh button re-reads without collapsing the section", () => {
    setQuotaSuccess(SUCCESS);
    const api = stubApi();
    render(h(QuotaView, { api }));
    fireEvent.click(screen.getByLabelText("Re-read latest quota"));
    expect(api.fetchQuota).toHaveBeenCalled();
    // Flipped to loading in-place — the body stayed mounted (section open).
    expect(screen.getByText(/Reading quota/)).toBeTruthy();
  });
});
