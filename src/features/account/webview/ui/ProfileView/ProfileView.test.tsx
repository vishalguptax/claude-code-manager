// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountData } from "../../../types";
import type { AccountApi } from "../../api";
import { _resetAccountState } from "../../model";
import { ProfileView } from "./ProfileView";

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

function makeData(
  over: Partial<AccountData["profile"]> = {},
  extra: Partial<AccountData> = {},
): AccountData {
  return {
    profile: {
      email: "user@example.com",
      displayName: "Ada Lovelace",
      organizationName: "",
      organizationRole: "",
      subscriptionType: "max",
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
      ...over,
    },
    usage: {} as AccountData["usage"],
    settings: {} as AccountData["settings"],
    permissions: [],
    availableModels: [],
    savedProfiles: [],
    activeProfileSlug: null,
    settingsSnapshots: [],
    ...extra,
  };
}

describe("ProfileView", () => {
  beforeEach(() => _resetAccountState());

  it("renders the signed-in identity and plan badge", () => {
    render(h(ProfileView, { data: makeData(), api: stubApi() }));
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("user@example.com")).toBeTruthy();
    expect(screen.getByText("max")).toBeTruthy();
  });

  it("the avatar shows the first initial and opens the switcher on click", () => {
    const api = stubApi();
    render(h(ProfileView, { data: makeData(), api }));
    const avatar = screen.getByLabelText("Switch account");
    expect(avatar.textContent).toBe("A");
    fireEvent.click(avatar);
    expect(api.openAccountSwitcher).toHaveBeenCalled();
  });

  it("offers Save profile only when no active profile slug", () => {
    const api = stubApi();
    const { rerender } = render(h(ProfileView, { data: makeData(), api }));
    expect(screen.getByTitle(/Save this account/)).toBeTruthy();
    rerender(h(ProfileView, { data: makeData({}, { activeProfileSlug: "saved" }), api }));
    expect(screen.queryByTitle(/Save this account/)).toBeNull();
  });

  it("logs out via the slash launcher", () => {
    const api = stubApi();
    render(h(ProfileView, { data: makeData(), api }));
    fireEvent.click(screen.getByText(/Log out/));
    expect(api.launchSlash).toHaveBeenCalledWith("/logout");
  });

  it("shows the corrupted-config banner and restores on click", () => {
    const api = stubApi();
    render(h(ProfileView, { data: makeData({ configCorrupted: true }), api }));
    expect(screen.getByText(/Claude config looks corrupted/)).toBeTruthy();
    // The banner copy also contains the word "Restore", so target the
    // button by role to avoid the multiple-match.
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    expect(api.restoreClaudeConfig).toHaveBeenCalled();
  });

  it("shows a session-expiry meta row when a token expiry is set", () => {
    const future = Date.now() + 3 * 86400000;
    render(h(ProfileView, { data: makeData({ tokenExpiresAt: future }), api: stubApi() }));
    expect(screen.getByText(/in 3 days/)).toBeTruthy();
  });

  it("renders the signed-out empty state with a switch action when profiles exist", () => {
    const api = stubApi();
    const data = makeData(
      { signedIn: false },
      {
        savedProfiles: [
          {
            slug: "s",
            label: "Saved",
            email: "s@x.com",
            organizationName: "",
            subscriptionType: "pro",
            savedAt: "",
            tokenExpiresAt: 0,
            credentialsHash: "",
            userID: "",
            accountUuid: "",
          },
        ],
      },
    );
    render(h(ProfileView, { data, api }));
    expect(screen.getByText("Not signed in")).toBeTruthy();
    fireEvent.click(screen.getByText(/Switch account/));
    expect(api.openAccountSwitcher).toHaveBeenCalled();
  });

  it("signed-out without saved profiles logs in", () => {
    const api = stubApi();
    render(h(ProfileView, { data: makeData({ signedIn: false }), api }));
    fireEvent.click(screen.getByText(/Log in/));
    expect(api.launchSlash).toHaveBeenCalledWith("/login");
  });
});
