import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../../shared/protocol/messages";
import type { QuotaSuccess } from "../quota";
import type { AccountData } from "../types";
import { handleAccountMessage } from "./index";
import {
  _resetAccountState,
  accountData,
  accountError,
  loading,
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
    usageWarming: false,
  };
}

const SUCCESS: QuotaSuccess = {
  quota: {
    fiveHour: { utilization: 5, resetsAt: "" },
    sevenDay: { utilization: 6, resetsAt: "" },
    capturedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  },
  live: {
    model: "Opus 4.6",
    contextUsedPercent: 3,
    contextSize: 1_000_000,
    sessionCostUsd: 0.5,
    linesAdded: 1,
    linesRemoved: 2,
    version: "2.1.86",
    capturedAt: new Date().toISOString(),
  },
};

describe("handleAccountMessage", () => {
  let send: { fetchQuota: ReturnType<typeof vi.fn<() => void>> };

  beforeEach(() => {
    _resetAccountState();
    send = { fetchQuota: vi.fn<() => void>() };
    // Seed an initial account so lastAccountKey is set and later switches
    // are detectable. The first payload is not a switch → no refetch.
    handleAccountMessage({ type: "accountData", data: makeAccount("first@x.com", "a") }, send);
  });

  it("stores account data and clears loading", () => {
    expect(accountData.value?.profile.email).toBe("first@x.com");
    expect(loading.value).toBe(false);
    expect(accountError.value).toBe("");
  });

  it("does not refetch when the same account is re-sent", () => {
    send.fetchQuota.mockClear();
    handleAccountMessage({ type: "accountData", data: makeAccount("first@x.com", "a") }, send);
    expect(send.fetchQuota).not.toHaveBeenCalled();
  });

  it("clears stale quota and refetches on an account switch", () => {
    setQuotaSuccess(SUCCESS);
    send.fetchQuota.mockClear();
    handleAccountMessage({ type: "accountData", data: makeAccount("second@x.com", "b") }, send);
    expect(send.fetchQuota).toHaveBeenCalledTimes(1);
    expect(quotaStatus.value.kind).toBe("loading");
  });

  it("applies a successful quotaData result", () => {
    handleAccountMessage({ type: "quotaData", result: { ok: true, data: SUCCESS } }, send);
    expect(quotaStatus.value).toEqual({ kind: "success", data: SUCCESS });
  });

  it("applies a failed quotaData result", () => {
    handleAccountMessage(
      {
        type: "quotaData",
        result: { ok: false, error: { kind: "not-installed", message: "enable" } },
      },
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
