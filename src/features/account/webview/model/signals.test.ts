import { beforeEach, describe, expect, it } from "vitest";
import type { QuotaError, QuotaSuccess } from "../../quota";
import {
  _resetAccountState,
  clearQuota,
  collapsedSections,
  isSectionCollapsed,
  quotaStatus,
  setQuotaError,
  setQuotaLoading,
  setQuotaSuccess,
  toggleSection,
} from "./signals";

const SUCCESS: QuotaSuccess = {
  quota: {
    fiveHour: { utilization: 10, resetsAt: "" },
    sevenDay: { utilization: 20, resetsAt: "" },
    capturedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  },
  live: {
    model: "Opus 4.6",
    contextUsedPercent: 3,
    contextSize: 1_000_000,
    sessionCostUsd: 0.97,
    linesAdded: 214,
    linesRemoved: 179,
    version: "2.1.86",
    capturedAt: new Date().toISOString(),
  },
};

const ERR: QuotaError = { kind: "not-installed", message: "enable it" };

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

  it("stores a successful quota read", () => {
    setQuotaSuccess(SUCCESS);
    expect(quotaStatus.value).toEqual({ kind: "success", data: SUCCESS });
  });

  it("sets a typed error", () => {
    setQuotaError(ERR);
    expect(quotaStatus.value).toEqual({ kind: "error", error: ERR });
  });

  it("flips to loading", () => {
    setQuotaLoading();
    expect(quotaStatus.value.kind).toBe("loading");
  });

  it("clears back to idle on account switch", () => {
    setQuotaSuccess(SUCCESS);
    clearQuota();
    expect(quotaStatus.value.kind).toBe("idle");
  });

  it("resets all state", () => {
    setQuotaSuccess(SUCCESS);
    toggleSection("quota");
    _resetAccountState();
    expect(quotaStatus.value.kind).toBe("idle");
    expect(collapsedSections.value.size).toBe(0);
  });
});
