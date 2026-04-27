import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Hoist temp dirs so vi.mock factories can see them.
const { CLAUDE_DIR, PROFILES_DIR, CLAUDE_JSON_PATH, CREDENTIALS_PATH } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const homeTmp = _path.join(_os.tmpdir(), ".claude-test-profiles-home");
  const claudeDir = _path.join(homeTmp, ".claude");
  return {
    CLAUDE_DIR: claudeDir,
    PROFILES_DIR: _path.join(claudeDir, "manager-accounts"),
    CLAUDE_JSON_PATH: _path.join(homeTmp, ".claude.json"),
    CREDENTIALS_PATH: _path.join(claudeDir, ".credentials.json"),
    HOME: homeTmp,
  };
});

// Redirect CLAUDE_DIR so profiles.ts writes to our temp dir.
vi.mock("../../../core/config", () => ({
  CLAUDE_DIR,
  PROJECTS_DIR: path.join(CLAUDE_DIR, "projects"),
  HISTORY_FILE: path.join(CLAUDE_DIR, "history.jsonl"),
  SESSIONS_DIR: path.join(CLAUDE_DIR, "sessions"),
  STATE_FILE: path.join(CLAUDE_DIR, ".csm-state.json"),
  SESSION_META_READ_BYTES: 4096,
}));

// Redirect os.homedir so the CLAUDE_JSON constant resolves into our temp.
vi.mock("os", async () => {
  const actual = (await vi.importActual<typeof import("os")>("os"));
  const homeTmp = path.dirname(CLAUDE_DIR);
  return { ...actual, homedir: () => homeTmp };
});

// Import under test AFTER mocks.
import {
  listProfiles,
  saveProfile,
  switchProfile,
  updateProfile,
  removeProfile,
  getActiveProfileSlug,
} from "../profiles";

const CLAUDE_JSON_SAMPLE = {
  oauthAccount: {
    emailAddress: "alice@example.com",
    organizationName: "Acme",
  },
  userID: "alice-id",
};

const CREDENTIALS_SAMPLE = {
  claudeAiOauth: {
    accessToken: "access-token-abc",
    refreshToken: "refresh-token-xyz",
    expiresAt: 1800000000000,
    subscriptionType: "max",
  },
};

function resetTmp(): void {
  fs.rmSync(path.dirname(CLAUDE_DIR), { recursive: true, force: true });
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
}

function writeLiveAccount(
  claudeJson: unknown = CLAUDE_JSON_SAMPLE,
  credentials: unknown = CREDENTIALS_SAMPLE,
): void {
  fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(claudeJson));
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials));
}

function clearLiveAccount(): void {
  fs.rmSync(CLAUDE_JSON_PATH, { force: true });
  fs.rmSync(CREDENTIALS_PATH, { force: true });
}

/**
 * Encode a minimal unsigned JWT. Only the payload section matters for
 * our identity-extraction cascade; header and signature are cosmetic.
 */
function makeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.`;
}

beforeEach(resetTmp);
afterEach(() => {
  fs.rmSync(path.dirname(CLAUDE_DIR), { recursive: true, force: true });
});

describe("listProfiles", () => {
  it("returns [] when manager-accounts dir doesn't exist", () => {
    expect(listProfiles()).toEqual([]);
  });

  it("returns [] when manager-accounts exists but is empty", () => {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    expect(listProfiles()).toEqual([]);
  });

  it("drops slot directories missing a credentials file", () => {
    fs.mkdirSync(path.join(PROFILES_DIR, "broken"), { recursive: true });
    fs.writeFileSync(
      path.join(PROFILES_DIR, "broken", ".claude.json"),
      JSON.stringify(CLAUDE_JSON_SAMPLE),
    );
    expect(listProfiles()).toEqual([]);
  });

  it("returns metadata for valid slots, sorted by label", () => {
    writeLiveAccount();
    saveProfile("Bravo Profile");
    // Second save must be a different identity (different userID) so
    // dedupe in saveProfile doesn't reject it. Accounts sharing a
    // userID collapse into one profile by design.
    writeLiveAccount({
      oauthAccount: { emailAddress: "a@a.com", organizationName: "Alpha" },
      userID: "alpha-id",
    });
    saveProfile("Alpha Profile");
    const list = listProfiles();
    expect(list.map((p) => p.label)).toEqual(["Alpha Profile", "Bravo Profile"]);
    expect(list[0].email).toBe("a@a.com");
    expect(list[0].credentialsHash).toBeTruthy();
  });
});

describe("saveProfile", () => {
  it("fails when no live account exists", () => {
    clearLiveAccount();
    const result = saveProfile("First");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no-active-account");
  });

  it("fails on empty label", () => {
    writeLiveAccount();
    const result = saveProfile("   ");
    expect(result.ok).toBe(false);
  });

  it("creates a slot with snapshot files and metadata", () => {
    writeLiveAccount();
    const result = saveProfile("My Work");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.slug).toBe("my-work");
    expect(result.data.email).toBe("alice@example.com");
    expect(result.data.subscriptionType).toBe("max");
    const slotDir = path.join(PROFILES_DIR, "my-work");
    expect(fs.existsSync(path.join(slotDir, ".claude.json"))).toBe(true);
    expect(fs.existsSync(path.join(slotDir, ".credentials.json"))).toBe(true);
    expect(fs.existsSync(path.join(slotDir, "profile.json"))).toBe(true);
  });

  it("auto-suffixes the slug when a different account reuses the same label", () => {
    // Two distinct identities sharing a label should both be savable
    // with auto-suffix on the slug. Same-identity duplicate saves are
    // rejected by dedupe and covered in the "dedupe" describe block.
    writeLiveAccount();
    saveProfile("Work");
    writeLiveAccount(
      { oauthAccount: { emailAddress: "b@b.com" }, userID: "b-id" },
      {
        claudeAiOauth: {
          accessToken: "tok-b",
          refreshToken: "r",
          expiresAt: 0,
          subscriptionType: "pro",
        },
      },
    );
    const second = saveProfile("Work");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.slug).toBe("work-2");
  });

  it("slugifies special characters safely", () => {
    writeLiveAccount();
    const result = saveProfile("Vishal @ Binary Veda / Work!");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.slug).toMatch(/^[a-z0-9_-]+$/);
  });
});

describe("switchProfile", () => {
  it("fails when slot doesn't exist", () => {
    const result = switchProfile("missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("slot-missing");
  });

  it("overwrites live creds with the slot's content", () => {
    writeLiveAccount();
    saveProfile("first");
    // Change the live creds to something different.
    writeLiveAccount(
      { oauthAccount: { emailAddress: "other@x.com" } },
      { claudeAiOauth: { accessToken: "different-token", expiresAt: 0 } },
    );
    const result = switchProfile("first");
    expect(result.ok).toBe(true);
    const live = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8")) as {
      claudeAiOauth?: { accessToken?: string };
    };
    expect(live.claudeAiOauth?.accessToken).toBe("access-token-abc");
  });

  it("fails and preserves live creds when snapshot JSON is corrupt", () => {
    writeLiveAccount();
    saveProfile("corrupt");
    // Corrupt the snapshot on disk.
    fs.writeFileSync(
      path.join(PROFILES_DIR, "corrupt", ".credentials.json"),
      "{not-json",
    );
    const originalCreds = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
    const result = switchProfile("corrupt");
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(CREDENTIALS_PATH, "utf-8")).toBe(originalCreds);
  });
});

describe("updateProfile", () => {
  it("fails when slot doesn't exist", () => {
    const result = updateProfile("missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("slot-missing");
  });

  it("overwrites slot with current live creds", () => {
    writeLiveAccount();
    saveProfile("work");
    const oldHash = listProfiles()[0].credentialsHash;
    // Rotate the live token.
    writeLiveAccount(CLAUDE_JSON_SAMPLE, {
      claudeAiOauth: {
        accessToken: "rotated-token",
        refreshToken: "new-refresh",
        expiresAt: 2000000000000,
        subscriptionType: "max",
      },
    });
    const result = updateProfile("work");
    expect(result.ok).toBe(true);
    const newHash = listProfiles()[0].credentialsHash;
    expect(newHash).not.toBe(oldHash);
  });
});

describe("removeProfile", () => {
  it("deletes the slot directory", () => {
    writeLiveAccount();
    saveProfile("doomed");
    expect(listProfiles()).toHaveLength(1);
    const result = removeProfile("doomed");
    expect(result.ok).toBe(true);
    expect(listProfiles()).toHaveLength(0);
  });

  it("returns ok even for non-existent slugs (idempotent)", () => {
    const result = removeProfile("never-existed");
    expect(result.ok).toBe(true);
  });
});

describe("getActiveProfileSlug", () => {
  it("returns null when no live creds exist", () => {
    expect(getActiveProfileSlug()).toBeNull();
  });

  it("returns null when neither hash nor identity match any saved profile", () => {
    writeLiveAccount();
    saveProfile("stored");
    // Different email AND different credentials — nothing to match on.
    writeLiveAccount(
      { oauthAccount: { emailAddress: "stranger@x.com" }, userID: "stranger-id" },
      { claudeAiOauth: { accessToken: "different", expiresAt: 0 } },
    );
    expect(getActiveProfileSlug()).toBeNull();
  });

  it("returns the matching slug when live hash equals a slot's hash", () => {
    writeLiveAccount();
    saveProfile("active-one");
    expect(getActiveProfileSlug()).toBe("active-one");
  });

  it("matches the saved slot via JWT sub when tokens rotate", () => {
    // Saved profile captures userID = "alice-id" from the sample.
    writeLiveAccount();
    saveProfile("rotated");
    // Rotate the access token — hash changes, but the NEW token is
    // still a JWT with the SAME sub (same account). Our cascade must
    // stay locked to the saved slot via JWT identity even though the
    // bytes have changed.
    const rotatedJwt = makeJwt({ sub: "alice-id", email: "alice@example.com" });
    writeLiveAccount(CLAUDE_JSON_SAMPLE, {
      claudeAiOauth: {
        accessToken: rotatedJwt,
        refreshToken: "rotated-refresh",
        expiresAt: 2_000_000_000_000,
        subscriptionType: "max",
      },
    });
    expect(getActiveProfileSlug()).toBe("rotated");
  });

  it("matches via JWT email claim when sub is absent", () => {
    writeLiveAccount();
    saveProfile("email-only");
    // Token with only an email claim — no sub. Identity still
    // resolvable via email match against the saved slot.
    const tokenNoSub = makeJwt({ email: "alice@example.com" });
    writeLiveAccount(CLAUDE_JSON_SAMPLE, {
      claudeAiOauth: {
        accessToken: tokenNoSub,
        refreshToken: "r",
        expiresAt: 0,
        subscriptionType: "max",
      },
    });
    expect(getActiveProfileSlug()).toBe("email-only");
  });

  it("flips after a switch so the active slug follows the swap", () => {
    writeLiveAccount();
    saveProfile("a");
    writeLiveAccount(
      { oauthAccount: { emailAddress: "b@b.com" }, userID: "b-id" },
      {
        claudeAiOauth: {
          accessToken: "token-b",
          refreshToken: "r",
          expiresAt: 0,
          subscriptionType: "pro",
        },
      },
    );
    saveProfile("b");
    expect(getActiveProfileSlug()).toBe("b");
    switchProfile("a");
    expect(getActiveProfileSlug()).toBe("a");
  });
});

describe("switchProfile — merge semantics", () => {
  it("preserves non-identity keys from live .claude.json", () => {
    // Live account has a rich .claude.json (projects, numStartups,
    // migration flags). After switching to a minimal saved profile,
    // those keys must survive — only oauthAccount + userID change.
    const richLive = {
      oauthAccount: { emailAddress: "live@x.com" },
      userID: "live-id",
      projects: { "/path/a": { foo: 1 } },
      numStartups: 42,
      migrationVersion: 7,
      sonnet1m45MigrationComplete: true,
      hasCompletedOnboarding: true,
    };
    writeLiveAccount(richLive, CREDENTIALS_SAMPLE);
    saveProfile("live-slot");
    // Snapshot a second, minimal profile.
    writeLiveAccount(
      { oauthAccount: { emailAddress: "other@x.com" }, userID: "other-id" },
      { claudeAiOauth: { accessToken: "o", refreshToken: "r", expiresAt: 0 } },
    );
    saveProfile("other-slot");
    // Restore the rich live state and switch to the minimal profile.
    writeLiveAccount(richLive, CREDENTIALS_SAMPLE);
    const result = switchProfile("other-slot");
    expect(result.ok).toBe(true);

    const liveAfter = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, "utf-8")) as Record<
      string,
      unknown
    >;
    // Identity swapped:
    expect((liveAfter.oauthAccount as { emailAddress: string }).emailAddress).toBe(
      "other@x.com",
    );
    expect(liveAfter.userID).toBe("other-id");
    // Everything else preserved from live:
    expect(liveAfter.projects).toEqual({ "/path/a": { foo: 1 } });
    expect(liveAfter.numStartups).toBe(42);
    expect(liveAfter.migrationVersion).toBe(7);
    expect(liveAfter.sonnet1m45MigrationComplete).toBe(true);
    expect(liveAfter.hasCompletedOnboarding).toBe(true);
  });
});

describe("getActiveProfileSlug — JWT identity", () => {

  it("matches the saved slot via JWT sub when .claude.json is stale", () => {
    // Save a profile with a specific userID in claude.json.
    writeLiveAccount(
      { oauthAccount: { emailAddress: "alice@example.com" }, userID: "alice-user-id" },
      CREDENTIALS_SAMPLE,
    );
    saveProfile("Alice");

    // Now simulate Claude CLI's /login mid-write: credentials.json
    // holds a JWT for account B but .claude.json still says Alice.
    // Our cascade must trust the JWT — otherwise the switcher would
    // show Alice as active while the live tokens belong to Bob.
    const bobToken = makeJwt({ sub: "alice-user-id", email: "alice@example.com" });
    writeLiveAccount(
      // Claude.json still stale (pretends CLI rewrote only creds first):
      { oauthAccount: { emailAddress: "alice@example.com" }, userID: "alice-user-id" },
      {
        claudeAiOauth: {
          accessToken: bobToken,
          refreshToken: "r",
          expiresAt: 0,
          subscriptionType: "max",
        },
      },
    );
    // JWT sub matches alice-user-id → returns the Alice slot.
    expect(getActiveProfileSlug()).toBe("alice");
  });

  it("returns null when live JWT sub matches no saved slot", () => {
    writeLiveAccount();
    saveProfile("Alice");
    const strangerToken = makeJwt({
      sub: "stranger-user-id",
      email: "stranger@example.com",
    });
    writeLiveAccount(CLAUDE_JSON_SAMPLE, {
      claudeAiOauth: {
        accessToken: strangerToken,
        refreshToken: "r",
        expiresAt: 0,
        subscriptionType: "pro",
      },
    });
    expect(getActiveProfileSlug()).toBeNull();
  });

  it("falls back to .claude.json identity when access token is opaque", () => {
    // Anthropic's current production access tokens are opaque (not
    // JWTs), so extractIdentityFromToken returns null. The cascade
    // must fall through to .claude.json — otherwise the saved slot
    // never matches at steady state and the "Save profile" button
    // stays visible after every save. The /login race the JWT path
    // protects against is transient; .claude.json is the only
    // identity source we have once the token has rotated past the
    // saved slot's hash.
    writeLiveAccount();
    saveProfile("Alice");
    // Mutate creds to trigger a hash mismatch with the saved slot,
    // forcing the cascade past Pass 1.
    writeLiveAccount(CLAUDE_JSON_SAMPLE, {
      claudeAiOauth: {
        accessToken: "opaque-non-jwt-token",
        refreshToken: "r",
        expiresAt: 0,
        subscriptionType: "max",
      },
    });
    expect(getActiveProfileSlug()).toBe("alice");
  });

  it("returns null when both JWT and .claude.json yield no identity", () => {
    writeLiveAccount();
    saveProfile("Alice");
    writeLiveAccount(
      { oauthAccount: {} }, // claude.json has no email/userID
      {
        claudeAiOauth: {
          accessToken: "opaque-non-jwt-token",
          refreshToken: "r",
          expiresAt: 0,
          subscriptionType: "max",
        },
      },
    );
    expect(getActiveProfileSlug()).toBeNull();
  });

  it("prefers newest savedAt when two slots match the same JWT sub", () => {
    // Create two slots with same userID — legacy duplicates from
    // pre-dedupe state. Bypass dedupe by writing the second slot
    // directly.
    writeLiveAccount();
    saveProfile("First");
    const secondSlot = path.join(PROFILES_DIR, "second");
    fs.mkdirSync(secondSlot, { recursive: true });
    fs.writeFileSync(
      path.join(secondSlot, ".claude.json"),
      JSON.stringify(CLAUDE_JSON_SAMPLE),
    );
    fs.writeFileSync(
      path.join(secondSlot, ".credentials.json"),
      JSON.stringify(CREDENTIALS_SAMPLE),
    );
    fs.writeFileSync(
      path.join(secondSlot, "profile.json"),
      JSON.stringify({
        label: "Second",
        savedAt: new Date(Date.now() + 60_000).toISOString(), // newer
        userID: "alice-id",
        email: "alice@example.com",
      }),
    );
    const token = makeJwt({ sub: "alice-id" });
    writeLiveAccount(CLAUDE_JSON_SAMPLE, {
      claudeAiOauth: {
        accessToken: token,
        refreshToken: "r",
        expiresAt: 0,
        subscriptionType: "max",
      },
    });
    // "second" has a later savedAt → wins the tiebreak.
    expect(getActiveProfileSlug()).toBe("second");
  });
});

describe("saveProfile — dedupe", () => {
  it("rejects a second save for the same userID with already-saved", () => {
    // Dedupe keys on the JWT access-token identity. Use a JWT sample
    // so the identity is extractable — opaque tokens skip dedupe on
    // purpose (see `extractIdentityFromToken`).
    const aliceToken = makeJwt({ sub: "alice-id", email: "alice@example.com" });
    writeLiveAccount(CLAUDE_JSON_SAMPLE, {
      claudeAiOauth: {
        accessToken: aliceToken,
        refreshToken: "r",
        expiresAt: 0,
        subscriptionType: "max",
      },
    });
    const first = saveProfile("First");
    expect(first.ok).toBe(true);

    const second = saveProfile("Second label");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("already-saved");
    expect(second.detail).toBe("first");
  });

  it("allows saving when a different identity is live", () => {
    writeLiveAccount();
    expect(saveProfile("Alpha").ok).toBe(true);
    writeLiveAccount(
      { oauthAccount: { emailAddress: "b@b.com" }, userID: "b-id" },
      {
        claudeAiOauth: {
          accessToken: "tok-b",
          refreshToken: "r",
          expiresAt: 0,
          subscriptionType: "pro",
        },
      },
    );
    expect(saveProfile("Bravo").ok).toBe(true);
    expect(listProfiles()).toHaveLength(2);
  });
});
