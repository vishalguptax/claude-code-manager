import { describe, expect, it } from "vitest";
import { profileRowText } from "../accountSwitcher";
import type { SavedProfile } from "../../account/profiles";
import type { ProfileQuota } from "../../account/types";

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
