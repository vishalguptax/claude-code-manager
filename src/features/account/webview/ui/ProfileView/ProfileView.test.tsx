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
    usageWarming: false,
    ...extra,
  };
}

describe("ProfileView", () => {
  beforeEach(() => _resetAccountState());

  it("renders the signed-in identity and plan badge (no separate Plan row)", () => {
    render(h(ProfileView, { data: makeData(), api: stubApi() }));
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("user@example.com")).toBeTruthy();
    // Plan shows once — in the badge only.
    expect(screen.getAllByText("Max").length).toBe(1);
    expect(screen.queryByText("Plan")).toBeNull();
  });

  it("shows the Max usage multiplier in the badge when the slug carries one", () => {
    render(
      h(ProfileView, {
        data: makeData({ subscriptionType: "max", rateLimitTier: "default_claude_max_20x" }),
        api: stubApi(),
      }),
    );
    expect(screen.getByText("Max 20x")).toBeTruthy();
  });

  it("shows a bare Team badge (seat tier is not derivable)", () => {
    render(
      h(ProfileView, {
        data: makeData(
          { subscriptionType: "team", rateLimitTier: "default_raven" },
          { settings: { model: "opus" } as AccountData["settings"] },
        ),
        api: stubApi(),
      }),
    );
    expect(screen.getByText("Team")).toBeTruthy();
    expect(screen.queryByText(/6.25|1.25/)).toBeNull();
  });

  it("never surfaces the raw internal rate-limit tier slug", () => {
    render(
      h(ProfileView, {
        data: makeData({ subscriptionType: "team", rateLimitTier: "default_raven" }),
        api: stubApi(),
      }),
    );
    expect(screen.queryByText(/default_raven/)).toBeNull();
    // Team has no multiplier — shows the bare family, never the codename.
    expect(screen.getAllByText("Team").length).toBeGreaterThan(0);
  });

  it("does not render Organization, Plan-since, or Credentials rows", () => {
    render(
      h(ProfileView, {
        data: makeData({
          organizationName: "Acme",
          organizationRole: "admin",
          subscriptionCreatedAt: "2024-03-15T00:00:00Z",
          credentialSource: "file",
        }),
        api: stubApi(),
      }),
    );
    expect(screen.queryByText("Organization")).toBeNull();
    expect(screen.queryByText("Plan since")).toBeNull();
    expect(screen.queryByText("Credentials")).toBeNull();
  });

  it("no longer renders an Open claude.ai button", () => {
    render(h(ProfileView, { data: makeData(), api: stubApi() }));
    expect(screen.queryByText(/Open claude\.ai/)).toBeNull();
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
