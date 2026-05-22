import { beforeEach, describe, expect, it } from "vitest";
import type { QuotaData, QuotaError } from "../../quota";
import {
  _resetAccountState,
  clearQuota,
  collapsedSections,
  isSectionCollapsed,
  quotaCacheAgeMs,
  quotaFetchedAtMs,
  quotaStatus,
  setQuotaError,
  setQuotaLoading,
  setQuotaSuccess,
  toggleSection,
} from "./signals";

const QUOTA: QuotaData = {
  fiveHour: { utilization: 10, resetsAt: "" },
  sevenDay: { utilization: 20, resetsAt: "" },
  sevenDaySonnet: null,
  sevenDayOpus: null,
  extraUsage: null,
  fetchedAt: new Date().toISOString(),
};

const ERR: QuotaError = { kind: "network", message: "offline" };

describe("account signals", () => {
  beforeEach(() => {
    _resetAccountState();
  });

  it("toggles a section on and off", () => {
    expect(isSectionCollapsed("usage")).toBe(false);
    toggleSection("usage");
    expect(isSectionCollapsed("usage")).toBe(true);
    expect(collapsedSections.value.has("usage")).toBe(true);
    toggleSection("usage");
    expect(isSectionCollapsed("usage")).toBe(false);
  });

  it("produces a new Set per toggle (reactive identity changes)", () => {
    const before = collapsedSections.value;
    toggleSection("profile");
    expect(collapsedSections.value).not.toBe(before);
  });

  it("records a successful quota fetch with a timestamp", () => {
    setQuotaSuccess(QUOTA);
    expect(quotaStatus.value.kind).toBe("success");
    expect(quotaFetchedAtMs.value).not.toBeNull();
    expect(quotaCacheAgeMs()).toBeGreaterThanOrEqual(0);
  });

  it("sets an error without touching the fetch timestamp", () => {
    setQuotaError(ERR);
    expect(quotaStatus.value).toEqual({ kind: "error", error: ERR });
    expect(quotaFetchedAtMs.value).toBeNull();
    expect(quotaCacheAgeMs()).toBeNull();
  });

  it("flips to loading", () => {
    setQuotaLoading();
    expect(quotaStatus.value.kind).toBe("loading");
  });

  it("clears the quota cache back to idle", () => {
    setQuotaSuccess(QUOTA);
    clearQuota();
    expect(quotaStatus.value.kind).toBe("idle");
    expect(quotaFetchedAtMs.value).toBeNull();
  });
});
