import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../../shared/protocol/messages";
import type { QuotaData } from "../quota";
import type { AccountData } from "../types";
import { handleAccountMessage } from "./index";
import {
  _resetAccountState,
  accountData,
  accountError,
  loading,
  quotaFetchedAtMs,
  quotaOptIn,
  quotaStatus,
  setQuotaSuccess,
} from "./model";

function makeAccount(email: string, slug: string | null): AccountData {
  return {
    profile: {
      email,
      displayName: "",
      organizationName: "",
      organizationRole: "",
      subscriptionType: "pro",
      rateLimitTier: "",
      accountCreatedAt: "",
      subscriptionCreatedAt: "",
      signedIn: true,
      tokenExpiresAt: 0,
      userID: "",
      accountUuid: "",
      startupCount: 0,
      firstUseDate: "",
      configCorrupted: false,
      credentialSource: "file",
    },
    usage: {
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
    },
    settings: {
      model: "",
      voiceEnabled: false,
      commitAttribution: "",
      prAttribution: "",
      statusLineCommand: "",
      includeCoAuthoredBy: false,
      spinnerTipsEnabled: false,
      defaultMode: "",
      additionalDirectories: [],
      cleanupPeriodDays: 0,
      effortLevel: "",
    },
    permissions: [],
    availableModels: [],
    savedProfiles: [],
    activeProfileSlug: slug,
    settingsSnapshots: [],
  };
}

const QUOTA: QuotaData = {
  fiveHour: { utilization: 5, resetsAt: "" },
  sevenDay: { utilization: 6, resetsAt: "" },
  sevenDaySonnet: null,
  sevenDayOpus: null,
  extraUsage: null,
  fetchedAt: new Date().toISOString(),
};

describe("handleAccountMessage", () => {
  let send: { fetchQuota: ReturnType<typeof vi.fn<() => void>> };

  beforeEach(() => {
    _resetAccountState();
    send = { fetchQuota: vi.fn<() => void>() };
    // Each test starts with a clean account identity. Apply an initial
    // payload so lastAccountKey is seeded and subsequent switches are
    // detectable.
    handleAccountMessage({ type: "accountData", data: makeAccount("first@x.com", "a") }, send);
  });

  it("stores account data and clears loading", () => {
    expect(accountData.value?.profile.email).toBe("first@x.com");
    expect(loading.value).toBe(false);
    expect(accountError.value).toBe("");
  });

  it("ignores quota refresh when not opted in on an account switch", () => {
    send.fetchQuota.mockClear();
    handleAccountMessage({ type: "accountData", data: makeAccount("second@x.com", "b") }, send);
    expect(send.fetchQuota).not.toHaveBeenCalled();
  });

  it("clears stale quota and refetches on account switch when opted in", () => {
    setQuotaSuccess(QUOTA);
    quotaOptIn.value = true;
    send.fetchQuota.mockClear();
    handleAccountMessage({ type: "accountData", data: makeAccount("switch@x.com", "c") }, send);
    // clearQuota reset the cache → age null → policy refetches.
    expect(quotaFetchedAtMs.value).toBeNull();
    expect(send.fetchQuota).toHaveBeenCalledTimes(1);
    expect(quotaStatus.value.kind).toBe("loading");
  });

  it("applies a successful quotaData result", () => {
    handleAccountMessage({ type: "quotaData", result: { ok: true, data: QUOTA } }, send);
    expect(quotaStatus.value).toEqual({ kind: "success", data: QUOTA });
  });

  it("applies a failed quotaData result", () => {
    handleAccountMessage(
      { type: "quotaData", result: { ok: false, error: { kind: "network", message: "down" } } },
      send,
    );
    expect(quotaStatus.value.kind).toBe("error");
  });

  it("surfaces a host error message", () => {
    const msg: Message = { type: "error", message: "boom" };
    handleAccountMessage(msg, send);
    expect(accountError.value).toBe("boom");
    expect(loading.value).toBe(false);
  });
});
