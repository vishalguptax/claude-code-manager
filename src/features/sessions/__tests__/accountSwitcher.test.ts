import { afterEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { SavedProfile } from "../../account/profiles";
import type { AccountData, ProfileQuota } from "../../account/types";

const switchProfileMock = vi.fn();
let accountData: AccountData;
vi.mock("../../account/profiles", () => ({
  switchProfile: (slug: string) => switchProfileMock(slug),
  updateProfile: vi.fn(),
  removeProfile: vi.fn(),
}));
vi.mock("../../account/parser", () => ({ parseAccountData: () => accountData }));
vi.mock("../../../extension/workspace", () => ({ getWorkspace: () => undefined }));
vi.mock("../accountPush", () => ({ postAccountData: vi.fn() }));

import { openAccountSwitcher, profileRowText } from "../accountSwitcher";

const NOW = Date.parse("2026-09-14T12:00:00.000Z");

function profile(over: Partial<SavedProfile> = {}): SavedProfile {
  return {
    slug: "work",
    label: "Work",
    email: "alex@example.dev",
    organizationName: "Acme",
    subscriptionType: "max",
    savedAt: "2026-09-01T00:00:00.000Z",
    tokenExpiresAt: 0,
    refreshTokenExpiresAt: 0,
    credentialsHash: "hash",
    userID: "uid",
    accountUuid: "uuid-work",
    ...over,
  };
}

function seen(hoursAgo: number, pct: number): ProfileQuota {
  return {
    sevenDayPercent: pct,
    fiveHourPercent: 10,
    sevenDayResetsAt: new Date(NOW + 2 * 24 * 3600_000).toISOString(),
    capturedAt: new Date(NOW - hoursAgo * 3600_000).toISOString(),
  };
}

describe("profileRowText", () => {
  it("puts the remembered quota where the choice is made", () => {
    // The whole point of the row: how much of this account's week is
    // gone, without having to switch into it to find out.
    const row = profileRowText(
      { ...profile(), lastQuota: seen(3, 62) },
      { isActive: false, isDuplicate: false },
      NOW,
    );
    expect(row.description).toBe("62% weekly · 3h ago");
  });

  it("keeps the active marker alongside the quota", () => {
    const row = profileRowText(
      { ...profile(), lastQuota: seen(1, 40) },
      { isActive: true, isDuplicate: false },
      NOW,
    );
    expect(row.description).toBe("Active · 40% weekly · 1h ago");
  });

  it("falls back to the bare status when no quota has been seen", () => {
    expect(
      profileRowText(profile(), { isActive: true, isDuplicate: false }, NOW).description,
    ).toBe("Active");
    expect(
      profileRowText(profile(), { isActive: false, isDuplicate: false }, NOW).description,
    ).toBe("");
  });

  it("drops a reading whose window has already reset", () => {
    const rolled: ProfileQuota = {
      ...seen(3, 62),
      sevenDayResetsAt: new Date(NOW - 3600_000).toISOString(),
    };
    expect(
      profileRowText({ ...profile(), lastQuota: rolled }, { isActive: false, isDuplicate: false }, NOW)
        .description,
    ).toBe("");
  });

  it("lines the identity up in the detail row", () => {
    expect(profileRowText(profile(), { isActive: false, isDuplicate: false }, NOW).detail).toBe(
      "alex@example.dev · max · Acme",
    );
  });

  it("flags a duplicate in both lines", () => {
    const row = profileRowText(profile(), { isActive: false, isDuplicate: true }, NOW);
    expect(row.description).toBe("Duplicate");
    expect(row.detail).toContain("duplicate — remove if unused");
  });

  it("always gives a detail so row heights match", () => {
    const bare = profile({ email: "", organizationName: "", subscriptionType: "" });
    expect(profileRowText(bare, { isActive: false, isDuplicate: false }, NOW).detail).toBe(
      "Saved profile",
    );
  });
});

const DAY = 86_400_000;

describe("profileRowText — login expiry", () => {
  /** The row description for a saved login with this refresh-token expiry. */
  const expiryText = (refreshTokenExpiresAt: number): string =>
    profileRowText(profile({ refreshTokenExpiresAt }), { isActive: false, isDuplicate: false }, NOW)
      .description;

  it("says nothing while more than three days remain, or when unrecorded", () => {
    expect(expiryText(NOW + 4 * DAY)).toBe("");
    expect(expiryText(0)).toBe("");
  });

  it("counts down the last three days, rounding up", () => {
    expect(expiryText(NOW + 3 * DAY)).toBe("login expires in 3 days");
    expect(expiryText(NOW + 1.2 * DAY)).toBe("login expires in 2 days");
    expect(expiryText(NOW + 60_000)).toBe("login expires in 1 day");
  });

  it("tells the user to sign in again once expired", () => {
    expect(expiryText(NOW - 1)).toBe("login expired — sign in again");
  });

  it("shows on the switcher row ahead of the quota", () => {
    const row = profileRowText(
      { ...profile({ refreshTokenExpiresAt: NOW + DAY }), lastQuota: seen(3, 62) },
      { isActive: false, isDuplicate: false },
      NOW,
    );
    expect(row.description.startsWith("login expires in 1 day · 62%")).toBe(true);
  });
});

describe("openAccountSwitcher — switching into an expired login", () => {
  type Listener = (...args: unknown[]) => unknown;
  let accept: Listener | undefined;
  let picker: { selectedItems: Array<{ slug?: string; action: string }> };

  function stubQuickPick(): void {
    picker = { selectedItems: [] };
    const listen = (assign: (l: Listener) => void) => (l: Listener) => {
      assign(l);
      return { dispose: () => {} };
    };
    (vscode.window as unknown as { createQuickPick: unknown }).createQuickPick = () =>
      Object.assign(picker, {
        onDidAccept: listen((l) => (accept = l)),
        onDidTriggerItemButton: listen(() => {}),
        onDidHide: listen(() => {}),
        show: () => {},
        hide: () => {},
        dispose: () => {},
      });
  }

  function withProfiles(...profiles: SavedProfile[]): void {
    accountData = {
      profile: { signedIn: true, email: "live@x.com" },
      savedProfiles: profiles,
      activeProfileSlug: null,
    } as unknown as AccountData;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    switchProfileMock.mockReset();
  });

  async function pick(slug: string): Promise<void> {
    stubQuickPick();
    await openAccountSwitcher({ getWebview: () => undefined, dispatch: async () => {} });
    picker.selectedItems = [{ action: "switch", slug }];
    await accept!();
  }

  it("warns before switching and does nothing when the user backs out", async () => {
    withProfiles(profile({ slug: "old", refreshTokenExpiresAt: Date.now() - DAY }));
    const warn = vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined as never);
    await pick("old");
    expect(warn).toHaveBeenCalledWith(
      "This saved login has expired.",
      expect.objectContaining({ modal: true, detail: expect.stringContaining("/login") }),
      "Switch anyway",
    );
    expect(switchProfileMock).not.toHaveBeenCalled();
  });

  it("switches when the user proceeds", async () => {
    withProfiles(profile({ slug: "old", refreshTokenExpiresAt: Date.now() - DAY }));
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Switch anyway" as never);
    switchProfileMock.mockReturnValue({ ok: true, data: profile({ slug: "old" }) });
    await pick("old");
    expect(switchProfileMock).toHaveBeenCalledWith("old");
  });

  it.each([
    ["slot-missing", "Switch failed: slot-missing."],
    ["Try again in a moment.", "Switch failed: Try again in a moment."],
  ])("reports a failed switch ending in exactly one period (%j)", async (detail, message) => {
    withProfiles(profile({ slug: "old", refreshTokenExpiresAt: Date.now() - DAY }));
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Switch anyway" as never);
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    switchProfileMock.mockReturnValue({ ok: false, error: "copy-failed", detail });
    await pick("old");
    expect(err).toHaveBeenCalledWith(message);
  });

  it("keeps the ordinary confirmation for a login that still works", async () => {
    withProfiles(profile({ slug: "fine", refreshTokenExpiresAt: Date.now() + 30 * DAY }));
    const warn = vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined as never);
    await pick("fine");
    expect(warn).toHaveBeenCalledWith("Switch Claude account?", expect.anything(), "Switch");
  });
});
