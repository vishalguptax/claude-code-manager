// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVscodeApi } from "../../../webview/shared/hooks";
import { _resetMessageBus } from "../../../webview/shared/model";
import AccountTab from "./index";
import { _resetAccountState, accountData, accountError, loading } from "./model";

function makeAccount() {
  return {
    profile: {
      email: "tab@x.com",
      displayName: "Tab User",
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
      credentialSource: "file" as const,
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
      defaultMode: "" as const,
      additionalDirectories: [],
      cleanupPeriodDays: 0,
      effortLevel: "",
    },
    permissions: [],
    availableModels: [],
    savedProfiles: [],
    activeProfileSlug: null,
    settingsSnapshots: [],
  };
}

describe("AccountTab", () => {
  let post: ReturnType<typeof vi.fn<(m: unknown) => void>>;

  beforeEach(() => {
    _resetAccountState();
    _resetMessageBus();
    post = vi.fn<(m: unknown) => void>();
    setVscodeApi({ postMessage: post });
  });
  afterEach(() => setVscodeApi(null));

  it("requests account data on mount and shows the loading state", () => {
    render(h(AccountTab, {}));
    expect(post).toHaveBeenCalledWith({ type: "getAccountData" });
    expect(screen.getByText(/Loading/)).toBeTruthy();
  });

  it("renders the three sections once data arrives", async () => {
    render(h(AccountTab, {}));
    accountData.value = makeAccount();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("Profile")).toBeTruthy());
    expect(screen.getByText("Quota")).toBeTruthy();
    expect(screen.getByText("Usage")).toBeTruthy();
  });

  it("shows the empty state when not loading and no data", async () => {
    render(h(AccountTab, {}));
    loading.value = false;
    accountData.value = null;
    await waitFor(() => expect(screen.getByText(/No account data available/)).toBeTruthy());
  });

  it("shows a host error", async () => {
    render(h(AccountTab, {}));
    accountError.value = "host blew up";
    await waitFor(() => expect(screen.getByText("host blew up")).toBeTruthy());
  });
});
