// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaData } from "../../../quota";
import type { AccountApi } from "../../api";
import {
  _resetAccountState,
  quotaOptIn,
  setQuotaError,
  setQuotaLoading,
  setQuotaSuccess,
} from "../../model";
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
    promptSaveProfile: vi.fn(),
    openAccountSwitcher: vi.fn(),
  };
}

const QUOTA: QuotaData = {
  fiveHour: { utilization: 42, resetsAt: "" },
  sevenDay: { utilization: 75, resetsAt: "" },
  sevenDayOpus: { utilization: 88, resetsAt: "" },
  sevenDaySonnet: null,
  extraUsage: {
    enabled: true,
    monthlyLimit: 5000,
    usedCredits: 1250,
    utilization: 25,
    currency: "USD",
  },
  fetchedAt: new Date().toISOString(),
};

describe("QuotaView", () => {
  beforeEach(() => _resetAccountState());

  it("idle state shows the opt-in CTA and fetches on click", () => {
    const api = stubApi();
    render(h(QuotaView, { api }));
    const cta = screen.getByText(/Check quota/);
    fireEvent.click(cta);
    expect(api.fetchQuota).toHaveBeenCalled();
    expect(quotaOptIn.value).toBe(true);
  });

  it("loading state shows the spinner label", () => {
    setQuotaLoading();
    render(h(QuotaView, { api: stubApi() }));
    expect(screen.getByText(/Checking your quota/)).toBeTruthy();
  });

  it("success state renders one bar per window plus extra usage", () => {
    setQuotaSuccess(QUOTA);
    render(h(QuotaView, { api: stubApi() }));
    expect(screen.getByText("5-hour window")).toBeTruthy();
    expect(screen.getByText("7-day window")).toBeTruthy();
    expect(screen.getByText("7-day Opus")).toBeTruthy();
    expect(screen.queryByText("7-day Sonnet")).toBeNull();
    expect(screen.getByText(/Extra usage/)).toBeTruthy();
    // progressbars: 5h, 7d, opus, extra = 4
    expect(screen.getAllByRole("progressbar").length).toBe(4);
  });

  it("error state renders the message and retries", () => {
    setQuotaError({ kind: "network", message: "you are offline" });
    const api = stubApi();
    render(h(QuotaView, { api }));
    expect(screen.getByText("you are offline")).toBeTruthy();
    fireEvent.click(screen.getByText(/Try again/));
    expect(api.fetchQuota).toHaveBeenCalled();
  });

  it("the header refresh button fetches without collapsing the section", () => {
    setQuotaSuccess(QUOTA);
    const api = stubApi();
    render(h(QuotaView, { api }));
    // Clicking Refresh fetches and flips to loading (it does NOT bubble
    // to the header, which would collapse the section and hide the
    // body entirely). The loading body proves the section stayed open.
    fireEvent.click(screen.getByLabelText("Refresh quota"));
    expect(api.fetchQuota).toHaveBeenCalled();
    expect(screen.getByText(/Checking your quota/)).toBeTruthy();
  });
});
