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
  CLAUDE_JSON_FILE: CLAUDE_JSON_PATH,
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

// Keep the developer's real Keychain out of these tests. On macOS the
// credentials module reads the Keychain BEFORE the file, so without this a
// test would see (and a switch would overwrite) the real signed-in account.
// `security` answers "no such item" (exit 44), leaving the temp file as the
// only credentials source.
// A test can put an item in this fake Keychain (`keychain.value`) to drive
// the Keychain backend; by default it is empty.
// `keychain.failWith` makes every Keychain call fail with that exit code
// (25 = locked) to stand in for a locked or unreachable Keychain.
const keychain = vi.hoisted(() => ({ value: null as string | null, failWith: 0 }));
vi.mock("child_process", () => ({
  execFileSync: (_bin: string, args: string[]) => {
    if (keychain.failWith) {
      throw Object.assign(new Error("security failed"), { status: keychain.failWith });
    }
    if (args[0] === "find-generic-password" && keychain.value !== null) return keychain.value;
    if (args[0] === "add-generic-password") {
      keychain.value = args[args.indexOf("-w") + 1];
      return "";
    }
    throw Object.assign(new Error("security: item not found"), { status: 44 });
  },
}));

// Programmable write failure for one target path: lets a test fail the
// rollback write while the switch's own write goes through. Everything else
// is the real atomic writer.
const atomicFail = vi.hoisted(() => ({ path: "", skip: 0 }));
vi.mock("../../../core/atomicWrite", async (importActual) => {
  const actual = await importActual<typeof import("../../../core/atomicWrite")>();
  return {
    ...actual,
    writeFileAtomic: (p: string, data: string | Uint8Array) => {
      if (atomicFail.path && p === atomicFail.path) {
        if (atomicFail.skip > 0) atomicFail.skip--;
        else throw new Error("disk full");
      }
      return actual.writeFileAtomic(p, data);
    },
  };
});

/**
 * The module under test, imported fresh (with its credentials dependency)
 * per test — a new extension host. Credentials keeps a short Keychain read
 * cache and remembers which Keychain bytes it has seen, so a test's
 * Keychain mock must not be answered from an earlier host's state. A test
 * that changes the fake Keychain between steps starts a new host the same
 * way, rather than reaching into the module to drop its cache.
 */
let P: typeof import("../profiles");
async function freshHost(): Promise<void> {
  vi.resetModules();
  P = await import("../profiles");
}
beforeEach(freshHost);

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

/**
 * Backdate a file's mtime. Identity trust compares the credentials' mtime
 * with `~/.claude.json`'s, so tests set the order explicitly rather than
 * relying on write timing.
 */
function backdate(filePath: string, msAgo: number): void {
  const when = new Date(Date.now() - msAgo);
  fs.utimesSync(filePath, when, when);
}

/** A token refresh that has settled: credentials changed a minute ago, identity untouched since. */
function settleRotation(): void {
  backdate(CLAUDE_JSON_PATH, 120_000);
  backdate(CREDENTIALS_PATH, 60_000);
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

const SWITCH_JOURNAL_PATH = `${CLAUDE_JSON_PATH}.claude-manager-switch.bak`;
const LEGACY_BAK_PATH = `${CLAUDE_JSON_PATH}.bak`;
const CONFIG_LOCK_DIR = `${CLAUDE_JSON_PATH}.lock`;

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

beforeEach(() => {
  resetTmp();
  atomicFail.path = "";
  atomicFail.skip = 0;
  keychain.value = null;
  keychain.failWith = 0;
});
afterEach(() => {
  fs.rmSync(path.dirname(CLAUDE_DIR), { recursive: true, force: true });
});

describe("listProfiles", () => {
  it("returns [] when manager-accounts dir doesn't exist", () => {
    expect(P.listProfiles()).toEqual([]);
  });

  it("returns [] when manager-accounts exists but is empty", () => {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    expect(P.listProfiles()).toEqual([]);
  });

  it("drops slot directories missing a credentials file", () => {
    fs.mkdirSync(path.join(PROFILES_DIR, "broken"), { recursive: true });
    fs.writeFileSync(
      path.join(PROFILES_DIR, "broken", ".claude.json"),
      JSON.stringify(CLAUDE_JSON_SAMPLE),
    );
    expect(P.listProfiles()).toEqual([]);
  });

  it("returns metadata for valid slots, sorted by label", () => {
    writeLiveAccount();
    P.saveProfile("Bravo Profile");
    // Second save must be a different identity (different userID) so
    // dedupe in saveProfile doesn't reject it. Accounts sharing a
    // userID collapse into one profile by design.
    writeLiveAccount({
      oauthAccount: { emailAddress: "a@a.com", organizationName: "Alpha" },
      userID: "alpha-id",
    });
    P.saveProfile("Alpha Profile");
    const list = P.listProfiles();
    expect(list.map((p) => p.label)).toEqual(["Alpha Profile", "Bravo Profile"]);
    expect(list[0].email).toBe("a@a.com");
    expect(list[0].credentialsHash).toBeTruthy();
  });
});

describe("saveProfile", () => {
  it("fails when no live account exists", () => {
    clearLiveAccount();
    const result = P.saveProfile("First");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no-active-account");
  });

  it("fails on empty label", () => {
    writeLiveAccount();
    const result = P.saveProfile("   ");
    expect(result.ok).toBe(false);
  });

  it("creates a slot with snapshot files and metadata", () => {
    writeLiveAccount();
    const result = P.saveProfile("My Work");
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
    P.saveProfile("Work");
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
    const second = P.saveProfile("Work");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.slug).toBe("work-2");
  });

  it("slugifies special characters safely", () => {
    writeLiveAccount();
    const result = P.saveProfile("Vishal @ Binary Veda / Work!");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.slug).toMatch(/^[a-z0-9_-]+$/);
  });
});

describe("switchProfile", () => {
  it("fails when slot doesn't exist", () => {
    const result = P.switchProfile("missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("slot-missing");
  });

  it("overwrites live creds with the slot's content", () => {
    writeLiveAccount();
    P.saveProfile("first");
    // Change the live creds to something different.
    writeLiveAccount(
      { oauthAccount: { emailAddress: "other@x.com" } },
      { claudeAiOauth: { accessToken: "different-token", expiresAt: 0 } },
    );
    const result = P.switchProfile("first");
    expect(result.ok).toBe(true);
    const live = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8")) as {
      claudeAiOauth?: { accessToken?: string };
    };
    expect(live.claudeAiOauth?.accessToken).toBe("access-token-abc");
  });

  it("fails and preserves live creds when snapshot JSON is corrupt", () => {
    writeLiveAccount();
    P.saveProfile("corrupt");
    // Corrupt the snapshot on disk.
    fs.writeFileSync(
      path.join(PROFILES_DIR, "corrupt", ".credentials.json"),
      "{not-json",
    );
    const originalCreds = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
    const result = P.switchProfile("corrupt");
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(CREDENTIALS_PATH, "utf-8")).toBe(originalCreds);
  });
});

describe("updateProfile", () => {
  it("fails when slot doesn't exist", () => {
    const result = P.updateProfile("missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("slot-missing");
  });

  it("overwrites slot with current live creds", () => {
    writeLiveAccount();
    P.saveProfile("work");
    const oldHash = P.listProfiles()[0].credentialsHash;
    // Rotate the live token.
    writeLiveAccount(CLAUDE_JSON_SAMPLE, {
      claudeAiOauth: {
        accessToken: "rotated-token",
        refreshToken: "new-refresh",
        expiresAt: 2000000000000,
        subscriptionType: "max",
      },
    });
    const result = P.updateProfile("work");
    expect(result.ok).toBe(true);
    const newHash = P.listProfiles()[0].credentialsHash;
    expect(newHash).not.toBe(oldHash);
  });
});

describe("removeProfile", () => {
  it("deletes the slot directory", () => {
    writeLiveAccount();
    P.saveProfile("doomed");
    expect(P.listProfiles()).toHaveLength(1);
    const result = P.removeProfile("doomed");
    expect(result.ok).toBe(true);
    expect(P.listProfiles()).toHaveLength(0);
  });

  it("returns ok even for non-existent slugs (idempotent)", () => {
    const result = P.removeProfile("never-existed");
    expect(result.ok).toBe(true);
  });
});

describe("getActiveProfileSlug", () => {
  it("returns null when no live creds exist", () => {
    expect(P.getActiveProfileSlug()).toBeNull();
  });

  it("returns null when neither hash nor identity match any saved profile", () => {
    writeLiveAccount();
    P.saveProfile("stored");
    // Different email AND different credentials — nothing to match on.
    writeLiveAccount(
      { oauthAccount: { emailAddress: "stranger@x.com" }, userID: "stranger-id" },
      { claudeAiOauth: { accessToken: "different", expiresAt: 0 } },
    );
    expect(P.getActiveProfileSlug()).toBeNull();
  });

  it("returns the matching slug when live hash equals a slot's hash", () => {
    writeLiveAccount();
    P.saveProfile("active-one");
    expect(P.getActiveProfileSlug()).toBe("active-one");
  });

  it("matches the saved slot via JWT sub when tokens rotate", () => {
    // Saved profile captures userID = "alice-id" from the sample.
    writeLiveAccount();
    P.saveProfile("rotated");
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
    expect(P.getActiveProfileSlug()).toBe("rotated");
  });

  it("matches via JWT email claim when sub is absent", () => {
    writeLiveAccount();
    P.saveProfile("email-only");
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
    expect(P.getActiveProfileSlug()).toBe("email-only");
  });

  it("flips after a switch so the active slug follows the swap", () => {
    writeLiveAccount();
    P.saveProfile("a");
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
    P.saveProfile("b");
    expect(P.getActiveProfileSlug()).toBe("b");
    P.switchProfile("a");
    expect(P.getActiveProfileSlug()).toBe("a");
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
    P.saveProfile("live-slot");
    // Snapshot a second, minimal profile.
    writeLiveAccount(
      { oauthAccount: { emailAddress: "other@x.com" }, userID: "other-id" },
      { claudeAiOauth: { accessToken: "o", refreshToken: "r", expiresAt: 0 } },
    );
    P.saveProfile("other-slot");
    // Restore the rich live state and switch to the minimal profile.
    writeLiveAccount(richLive, CREDENTIALS_SAMPLE);
    const result = P.switchProfile("other-slot");
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
    P.saveProfile("Alice");

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
    expect(P.getActiveProfileSlug()).toBe("alice");
  });

  it("returns null when live JWT sub matches no saved slot", () => {
    writeLiveAccount();
    P.saveProfile("Alice");
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
    expect(P.getActiveProfileSlug()).toBeNull();
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
    P.saveProfile("Alice");
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
    expect(P.getActiveProfileSlug()).toBe("alice");
  });

  it("returns null when both JWT and .claude.json yield no identity", () => {
    writeLiveAccount();
    P.saveProfile("Alice");
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
    expect(P.getActiveProfileSlug()).toBeNull();
  });

  it("prefers newest savedAt when two slots match the same JWT sub", () => {
    // Create two slots with same userID — legacy duplicates from
    // pre-dedupe state. Bypass dedupe by writing the second slot
    // directly.
    writeLiveAccount();
    P.saveProfile("First");
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
    expect(P.getActiveProfileSlug()).toBe("second");
  });
});

describe("getActiveProfileSlug — accountUuid", () => {
  it("matches via oauthAccount.accountUuid even when userID and email differ", () => {
    // Save a snapshot with accountUuid in oauthAccount.
    writeLiveAccount(
      {
        oauthAccount: {
          emailAddress: "alice@example.com",
          accountUuid: "uuid-alice",
        },
        userID: "shared-device-id",
      },
      CREDENTIALS_SAMPLE,
    );
    P.saveProfile("Alice");
    // Live state simulates the same account but userID rewritten by
    // CLI to a different device-id (which can happen on re-init), and
    // a corrupted email field. accountUuid is the only stable signal.
    writeLiveAccount(
      {
        oauthAccount: {
          emailAddress: "different@x.com",
          accountUuid: "uuid-alice",
        },
        userID: "rotated-device-id",
      },
      {
        claudeAiOauth: {
          accessToken: "opaque-token",
          refreshToken: "r",
          expiresAt: 0,
          subscriptionType: "max",
        },
      },
    );
    expect(P.getActiveProfileSlug()).toBe("alice");
  });

  it("does not collide two distinct accounts that share the device-stable userID", () => {
    // Two genuinely different accounts whose .claude.json captured
    // the same `userID` (device-stable). With accountUuid populated,
    // the matcher must NOT collapse them.
    writeLiveAccount(
      {
        oauthAccount: {
          emailAddress: "a@x.com",
          accountUuid: "uuid-a",
        },
        userID: "device-stable-id",
      },
      CREDENTIALS_SAMPLE,
    );
    P.saveProfile("A");
    writeLiveAccount(
      {
        oauthAccount: {
          emailAddress: "b@x.com",
          accountUuid: "uuid-b",
        },
        userID: "device-stable-id",
      },
      {
        claudeAiOauth: {
          accessToken: "tok-b",
          refreshToken: "r",
          expiresAt: 0,
          subscriptionType: "pro",
        },
      },
    );
    P.saveProfile("B");
    // Live = B → must match B, not A.
    expect(P.getActiveProfileSlug()).toBe("b");
  });
});

describe("syncActiveProfile", () => {
  it("returns null when no slot matches the live identity", () => {
    writeLiveAccount();
    // No profiles yet — syncActiveProfile is a no-op.
    expect(P.syncActiveProfile()).toEqual({ kind: "none" });
  });

  it("rewrites the matching slot when live tokens have rotated", () => {
    writeLiveAccount();
    P.saveProfile("rotated");
    const oldHash = P.listProfiles()[0].credentialsHash;
    // Simulate a token rotation in the live creds — same identity,
    // new bytes. syncActiveProfile must pull the new bytes into the
    // slot so a future switch back doesn't restore the old (now
    // server-revoked) refresh token.
    writeLiveAccount(CLAUDE_JSON_SAMPLE, {
      claudeAiOauth: {
        accessToken: "rotated-access",
        refreshToken: "rotated-refresh",
        expiresAt: 9_000_000_000_000,
        subscriptionType: "max",
      },
    });
    settleRotation();
    expect(P.syncActiveProfile()).toEqual({ kind: "synced", slug: "rotated" });
    const newHash = P.listProfiles()[0].credentialsHash;
    expect(newHash).not.toBe(oldHash);
  });

  it("is a no-op when the live creds already match the slot byte-for-byte", () => {
    writeLiveAccount();
    P.saveProfile("stable");
    const before = fs.statSync(
      path.join(PROFILES_DIR, "stable", "profile.json"),
    ).mtimeMs;
    // Call a few ms later; with no rotation, profile.json must NOT
    // get bumped (avoids self-triggering loops when called from a
    // file watcher).
    expect(P.syncActiveProfile()).toEqual({ kind: "current", slug: "stable" });
    const after = fs.statSync(
      path.join(PROFILES_DIR, "stable", "profile.json"),
    ).mtimeMs;
    expect(after).toBe(before);
  });
});

describe("switchProfile — outgoing slot auto-sync", () => {
  it("captures the active slot's freshest tokens before swapping", () => {
    // Save A and B as distinct accounts.
    writeLiveAccount(
      {
        oauthAccount: { emailAddress: "a@x.com", accountUuid: "uuid-a" },
        userID: "id-a",
      },
      CREDENTIALS_SAMPLE,
    );
    P.saveProfile("A");
    writeLiveAccount(
      {
        oauthAccount: { emailAddress: "b@x.com", accountUuid: "uuid-b" },
        userID: "id-b",
      },
      {
        claudeAiOauth: {
          accessToken: "b-original",
          refreshToken: "b-refresh-1",
          expiresAt: 1_900_000_000_000,
          subscriptionType: "max",
        },
      },
    );
    P.saveProfile("B");
    // B is currently live. Simulate the CLI rotating B's tokens in
    // place (auto-refresh while B is active) — slot B still has the
    // ORIGINAL token; live has the rotated one.
    writeLiveAccount(
      {
        oauthAccount: { emailAddress: "b@x.com", accountUuid: "uuid-b" },
        userID: "id-b",
      },
      {
        claudeAiOauth: {
          accessToken: "b-rotated",
          refreshToken: "b-refresh-2",
          expiresAt: 2_000_000_000_000,
          subscriptionType: "max",
        },
      },
    );
    settleRotation();
    // Switch to A. Outgoing slot (B) must be auto-synced with the
    // rotated tokens before the swap. Otherwise switching back to B
    // later would restore the now-server-revoked b-refresh-1.
    const result = P.switchProfile("a");
    expect(result.ok).toBe(true);
    const slotBCreds = JSON.parse(
      fs.readFileSync(
        path.join(PROFILES_DIR, "b", ".credentials.json"),
        "utf-8",
      ),
    ) as { claudeAiOauth: { accessToken: string; refreshToken: string } };
    expect(slotBCreds.claudeAiOauth.accessToken).toBe("b-rotated");
    expect(slotBCreds.claudeAiOauth.refreshToken).toBe("b-refresh-2");
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
    const first = P.saveProfile("First");
    expect(first.ok).toBe(true);

    const second = P.saveProfile("Second label");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("already-saved");
    expect(second.detail).toBe("first");
  });

  it("allows saving when a different identity is live", () => {
    writeLiveAccount();
    expect(P.saveProfile("Alpha").ok).toBe(true);
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
    expect(P.saveProfile("Bravo").ok).toBe(true);
    expect(P.listProfiles()).toHaveLength(2);
  });
});

// Realistic shapes: opaque production tokens (no JWT identity), a
// `refreshTokenExpiresAt`, and machine-level `mcpOAuth` beside the account's
// `claudeAiOauth` — the layout Claude Code writes today.
const ACCOUNT_A = {
  config: { oauthAccount: { emailAddress: "a@x.com", accountUuid: "uuid-a" }, userID: "dev-1" },
  creds: {
    claudeAiOauth: {
      accessToken: "sk-ant-oat01-a1",
      refreshToken: "sk-ant-ort01-a1",
      expiresAt: 1_900_000_000_000,
      refreshTokenExpiresAt: 1_950_000_000_000,
      subscriptionType: "max",
    },
  },
};
const ACCOUNT_B = {
  config: { oauthAccount: { emailAddress: "b@x.com", accountUuid: "uuid-b" }, userID: "dev-1" },
  creds: {
    claudeAiOauth: {
      accessToken: "sk-ant-oat01-b1",
      refreshToken: "sk-ant-ort01-b1",
      expiresAt: 1_900_000_000_000,
      subscriptionType: "pro",
    },
  },
};

/** Save A then B, leaving B live and settled. */
function saveBothAccounts(): void {
  writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
  P.saveProfile("A");
  writeLiveAccount(ACCOUNT_B.config, ACCOUNT_B.creds);
  P.saveProfile("B");
  settleRotation();
}

function slotCreds(slug: string): { claudeAiOauth: { accessToken: string } } {
  return readJson(path.join(PROFILES_DIR, slug, ".credentials.json")) as {
    claudeAiOauth: { accessToken: string };
  };
}

describe("syncActiveProfile — /login race", () => {
  it("does not file a new login's tokens under the old account's slot", () => {
    writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
    P.saveProfile("A");
    // `/login` as someone new: the CLI writes the new tokens first, and
    // ~/.claude.json still names A until the profile fetch lands.
    backdate(CLAUDE_JSON_PATH, 5_000);
    fs.writeFileSync(
      CREDENTIALS_PATH,
      JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-new", expiresAt: 1 } }),
    );

    const outcome = P.syncActiveProfile();
    expect(outcome.kind).toBe("deferred");
    if (outcome.kind === "deferred") {
      expect(outcome.retryInMs).toBeGreaterThan(0);
      expect(outcome.retryInMs).toBeLessThanOrEqual(30_000);
    }
    expect(slotCreds("a").claudeAiOauth.accessToken).toBe("sk-ant-oat01-a1");

    // The identity write that ends /login: now ~/.claude.json vouches for
    // the tokens, and they belong to nobody saved.
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(ACCOUNT_B.config));
    expect(P.syncActiveProfile()).toEqual({ kind: "none" });
    expect(slotCreds("a").claudeAiOauth.accessToken).toBe("sk-ant-oat01-a1");
  });

  it("syncs a refresh once ~/.claude.json is rewritten after it", () => {
    writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
    P.saveProfile("A");
    const rotated = { claudeAiOauth: { ...ACCOUNT_A.creds.claudeAiOauth, accessToken: "sk-ant-oat01-a2", expiresAt: 1_900_000_100_000 } };
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(rotated));
    backdate(CREDENTIALS_PATH, 1_000);
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify({ ...ACCOUNT_A.config, numStartups: 2 }));
    expect(P.syncActiveProfile()).toEqual({ kind: "synced", slug: "a" });
    expect(slotCreds("a").claudeAiOauth.accessToken).toBe("sk-ant-oat01-a2");
  });

  it("trusts a token that names its own account without waiting", () => {
    const jwtA = makeJwt({ account_uuid: "uuid-a", email: "a@x.com" });
    writeLiveAccount(ACCOUNT_A.config, { claudeAiOauth: { accessToken: jwtA, expiresAt: 1 } });
    P.saveProfile("A");
    const jwtA2 = makeJwt({ account_uuid: "uuid-a", email: "a@x.com", n: 2 });
    backdate(CLAUDE_JSON_PATH, 5_000);
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ claudeAiOauth: { accessToken: jwtA2, expiresAt: 2 } }));
    expect(P.syncActiveProfile()).toEqual({ kind: "synced", slug: "a" });
  });
});

describe("updateProfile — never goes backwards", () => {
  it("refuses to replace a slot's tokens with an older generation", () => {
    writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
    P.saveProfile("A");
    const older = { claudeAiOauth: { ...ACCOUNT_A.creds.claudeAiOauth, accessToken: "old", expiresAt: 1_800_000_000_000 } };
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(older));
    const result = P.updateProfile("a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("stale-source");
    expect(slotCreds("a").claudeAiOauth.accessToken).toBe("sk-ant-oat01-a1");
  });
});

describe("slot files", () => {
  it("are owner-only and carry the refresh-token expiry into the listing", () => {
    writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
    P.saveProfile("A");
    if (process.platform !== "win32") {
      for (const name of [".credentials.json", ".claude.json", "profile.json"]) {
        expect(fs.statSync(path.join(PROFILES_DIR, "a", name)).mode & 0o777).toBe(0o600);
      }
    }
    expect(P.listProfiles()[0].refreshTokenExpiresAt).toBe(1_950_000_000_000);
  });

  it("reports 0 when the CLI did not record a refresh-token expiry", () => {
    writeLiveAccount(ACCOUNT_B.config, ACCOUNT_B.creds);
    P.saveProfile("B");
    expect(P.listProfiles()[0].refreshTokenExpiresAt).toBe(0);
  });
});

describe("switchProfile — live state safety", () => {
  it("refuses, and writes nothing, when ~/.claude.json is empty", () => {
    saveBothAccounts();
    fs.writeFileSync(CLAUDE_JSON_PATH, "");
    const credsBefore = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
    const result = P.switchProfile("a");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("live-unreadable");
      expect(result.detail).toBe(
        "~/.claude.json is being written by Claude Code right now, so it was left untouched. Try again in a moment",
      );
    }
    expect(fs.readFileSync(CLAUDE_JSON_PATH, "utf-8")).toBe("");
    expect(fs.readFileSync(CREDENTIALS_PATH, "utf-8")).toBe(credsBefore);
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
  });

  it("refuses when ~/.claude.json is not valid JSON", () => {
    saveBothAccounts();
    fs.writeFileSync(CLAUDE_JSON_PATH, '{"projects": {');
    const result = P.switchProfile("a");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("live-unreadable");
      expect(result.detail).toContain("~/.claude.json isn't valid JSON");
    }
    expect(fs.readFileSync(CLAUDE_JSON_PATH, "utf-8")).toBe('{"projects": {');
  });

  it("treats a ~/.claude.json left empty past the settle window like an absent one", () => {
    // Refusing it would block every switch forever; there is no identity
    // in it to lose.
    writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
    P.saveProfile("A");
    fs.writeFileSync(CLAUDE_JSON_PATH, "");
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(CLAUDE_JSON_PATH, old, old);
    expect(P.switchProfile("a").ok).toBe(true);
    expect(readJson(CLAUDE_JSON_PATH)).toEqual(ACCOUNT_A.config);
  });

  it("writes only the identity keys when ~/.claude.json does not exist", () => {
    writeLiveAccount({ ...ACCOUNT_A.config, projects: { "/old": { allowedTools: ["Bash"] } } }, ACCOUNT_A.creds);
    P.saveProfile("A");
    fs.rmSync(CLAUDE_JSON_PATH);
    expect(P.switchProfile("a").ok).toBe(true);
    // The snapshot's frozen projects (trust, approvals) are not resurrected.
    expect(readJson(CLAUDE_JSON_PATH)).toEqual(ACCOUNT_A.config);
  });

  it("swaps only claudeAiOauth, keeping the live MCP connector tokens", () => {
    writeLiveAccount(ACCOUNT_A.config, { ...ACCOUNT_A.creds, mcpOAuth: { stale: { accessToken: "old" } } });
    P.saveProfile("A");
    const liveMcp = { linear: { accessToken: "l" }, sentry: { accessToken: "s" } };
    writeLiveAccount(ACCOUNT_B.config, { ...ACCOUNT_B.creds, mcpOAuth: liveMcp, other: 1 });
    settleRotation();
    expect(P.switchProfile("a").ok).toBe(true);
    const live = readJson(CREDENTIALS_PATH);
    expect(live.claudeAiOauth).toEqual(ACCOUNT_A.creds.claudeAiOauth);
    expect(live.mcpOAuth).toEqual(liveMcp);
    expect(live.other).toBe(1);
    // And the slot is recognised as active with the merged blob live.
    expect(P.getActiveProfileSlug()).toBe("a");
  });

  it("refuses when the live credentials cannot be parsed", () => {
    saveBothAccounts();
    fs.writeFileSync(CREDENTIALS_PATH, '{"claudeAiOauth": ');
    const configBefore = fs.readFileSync(CLAUDE_JSON_PATH, "utf-8");
    const result = P.switchProfile("a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("live-unreadable");
    expect(fs.readFileSync(CLAUDE_JSON_PATH, "utf-8")).toBe(configBefore);
  });

  it("refuses while the outgoing account's new tokens are unconfirmed", () => {
    saveBothAccounts();
    // B's tokens just changed and ~/.claude.json predates them.
    backdate(CLAUDE_JSON_PATH, 5_000);
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-x", expiresAt: 1_900_000_000_001 } }));
    const result = P.switchProfile("a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("identity-settling");
    expect(slotCreds("b").claudeAiOauth.accessToken).toBe("sk-ant-oat01-b1");
    expect((readJson(CLAUDE_JSON_PATH).oauthAccount as { emailAddress: string }).emailAddress).toBe("b@x.com");
  });

  // Waits out withLocks' real 3 s acquire timeout, hence the budget.
  it("refuses while Claude Code holds the config lock", () => {
    saveBothAccounts();
    fs.mkdirSync(CONFIG_LOCK_DIR);
    try {
      const result = P.switchProfile("a");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("locked");
      expect((readJson(CLAUDE_JSON_PATH).oauthAccount as { emailAddress: string }).emailAddress).toBe("b@x.com");
    } finally {
      fs.rmdirSync(CONFIG_LOCK_DIR);
    }
  }, 15_000);

  it("releases its locks and leaves no journal after a successful switch", () => {
    saveBothAccounts();
    expect(P.switchProfile("a").ok).toBe(true);
    expect(fs.existsSync(CONFIG_LOCK_DIR)).toBe(false);
    expect(fs.existsSync(path.join(CLAUDE_DIR, ".oauth_refresh.lock"))).toBe(false);
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
  });

  it("never deletes an unrelated ~/.claude.json.bak", () => {
    saveBothAccounts();
    fs.writeFileSync(LEGACY_BAK_PATH, "my own backup");
    expect(P.switchProfile("a").ok).toBe(true);
    expect(fs.readFileSync(LEGACY_BAK_PATH, "utf-8")).toBe("my own backup");
  });

  it("rolls the identity back when the credentials write fails", () => {
    saveBothAccounts();
    const projects = { "/p": { hasTrustDialogAccepted: true } };
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify({ ...ACCOUNT_B.config, projects }));
    settleRotation();
    // Block the credentials module's temp file so its write fails.
    fs.mkdirSync(`${CREDENTIALS_PATH}.tmp`);
    const result = P.switchProfile("a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("copy-failed");
    expect(readJson(CLAUDE_JSON_PATH)).toEqual({ ...ACCOUNT_B.config, projects });
    expect(slotCreds("b").claudeAiOauth.accessToken).toBe("sk-ant-oat01-b1");
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
  });
});

function writeJournal(over: Record<string, unknown> = {}): void {
  fs.writeFileSync(
    SWITCH_JOURNAL_PATH,
    JSON.stringify({
      claudeManagerSwitch: 1,
      previous: ACCOUNT_B.config,
      target: ACCOUNT_A.config,
      previousTokenHash: "",
      targetTokenHash: "",
      ...over,
    }),
  );
}

describe("interrupted switch recovery", () => {
  /** The state a switch B → A leaves when it dies between its two writes. */
  function interruptSwitch(journalAgeMs: number): void {
    saveBothAccounts();
    writeJournal({ targetTokenHash: "a-tokens" });
    backdate(SWITCH_JOURNAL_PATH, journalAgeMs);
    // ~/.claude.json already names A; the tokens are still B's. Claude
    // Code has gone on recording project state since.
    fs.writeFileSync(
      CLAUDE_JSON_PATH,
      JSON.stringify({ ...ACCOUNT_A.config, projects: { "/new": { hasTrustDialogAccepted: true } } }),
    );
  }

  it("does not prompt about a journal under a minute old (another window may be mid-switch)", () => {
    interruptSwitch(10_000);
    expect(P.findInterruptedSwitch()).toBeNull();
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(true);
  });

  it("does not prompt while the config lock is held", () => {
    interruptSwitch(120_000);
    fs.mkdirSync(CONFIG_LOCK_DIR);
    try {
      expect(P.findInterruptedSwitch()).toBeNull();
    } finally {
      fs.rmdirSync(CONFIG_LOCK_DIR);
    }
  });

  it("reports an interrupted switch with its age and account", () => {
    interruptSwitch(120_000);
    const pending = P.findInterruptedSwitch();
    expect(pending).toMatchObject({ path: SWITCH_JOURNAL_PATH, legacy: false, email: "b@x.com" });
    expect(Date.now() - pending!.writtenAt).toBeGreaterThanOrEqual(120_000);
  });

  it("restores only the identity keys, keeping everything recorded since", () => {
    interruptSwitch(120_000);
    const pending = P.findInterruptedSwitch()!;
    expect(P.restoreInterruptedSwitch(pending).ok).toBe(true);
    expect(readJson(CLAUDE_JSON_PATH)).toEqual({
      ...ACCOUNT_B.config,
      projects: { "/new": { hasTrustDialogAccepted: true } },
    });
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
    // Credentials are untouched: the switch never replaced them.
    expect((readJson(CREDENTIALS_PATH).claudeAiOauth as { accessToken: string }).accessToken).toBe("sk-ant-oat01-b1");
  });

  it("refuses to restore into an unparseable ~/.claude.json", () => {
    interruptSwitch(120_000);
    const pending = P.findInterruptedSwitch()!;
    fs.writeFileSync(CLAUDE_JSON_PATH, "{");
    const result = P.restoreInterruptedSwitch(pending);
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(CLAUDE_JSON_PATH, "utf-8")).toBe("{");
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(true);
  });

  it("silently clears a journal whose switch actually finished", () => {
    saveBothAccounts();
    // Run a real switch, then put back the journal it removed — standing in
    // for a crash after the credentials write but before the cleanup.
    expect(P.switchProfile("a").ok).toBe(true);
    const liveOauth = readJson(CREDENTIALS_PATH).claudeAiOauth;
    const { createHash } = require("crypto") as typeof import("crypto");
    const targetTokenHash = createHash("sha256").update(JSON.stringify(liveOauth)).digest("hex");
    writeJournal({ targetTokenHash });
    backdate(SWITCH_JOURNAL_PATH, 120_000);
    expect(P.findInterruptedSwitch()).toBeNull();
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
  });

  it("ignores a legacy ~/.claude.json.bak that is not an interrupted switch", () => {
    saveBothAccounts();
    // A user's own backup of the same account that is live: no mismatch.
    fs.writeFileSync(LEGACY_BAK_PATH, JSON.stringify(ACCOUNT_B.config));
    backdate(LEGACY_BAK_PATH, 120_000);
    expect(P.findInterruptedSwitch()).toBeNull();
    expect(fs.existsSync(LEGACY_BAK_PATH)).toBe(true);
  });

  it("recognises a legacy full-copy backup with the interrupted-switch signature", () => {
    saveBothAccounts();
    fs.writeFileSync(LEGACY_BAK_PATH, JSON.stringify({ ...ACCOUNT_B.config, projects: { "/stale": {} } }));
    backdate(LEGACY_BAK_PATH, 120_000);
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify({ ...ACCOUNT_A.config, projects: { "/new": {} } }));
    const pending = P.findInterruptedSwitch();
    expect(pending).toMatchObject({ path: LEGACY_BAK_PATH, legacy: true, email: "b@x.com" });
    expect(P.restoreInterruptedSwitch(pending!).ok).toBe(true);
    // Identity from the backup; the stale projects map is NOT restored.
    expect(readJson(CLAUDE_JSON_PATH)).toEqual({ ...ACCOUNT_B.config, projects: { "/new": {} } });
    expect(fs.existsSync(LEGACY_BAK_PATH)).toBe(false);
  });

  it("discard removes the reported backup and nothing else", () => {
    interruptSwitch(120_000);
    fs.writeFileSync(LEGACY_BAK_PATH, "unrelated");
    const pending = P.findInterruptedSwitch()!;
    P.discardInterruptedSwitch(pending);
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
    expect(fs.readFileSync(LEGACY_BAK_PATH, "utf-8")).toBe("unrelated");
  });
});

describe("interrupted switch recovery — state moved on", () => {
  /** Journal for a B → A switch, aged past the minimum. */
  function staleJournal(): void {
    writeJournal();
    backdate(SWITCH_JOURNAL_PATH, 120_000);
  }

  it("clears the journal without asking after a /login as a third account", () => {
    saveBothAccounts();
    staleJournal();
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify({ oauthAccount: { emailAddress: "d@x.com", accountUuid: "uuid-d" } }));
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-d" } }));
    expect(P.findInterruptedSwitch()).toBeNull();
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
  });

  it("clears the journal when the switch completed and the target's tokens were refreshed since", () => {
    saveBothAccounts();
    staleJournal();
    // Crash after the credentials write: config and tokens are A's, and A's
    // tokens have rotated, so no hash matches anything recorded.
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(ACCOUNT_A.config));
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-a9" } }));
    expect(P.findInterruptedSwitch()).toBeNull();
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
  });

  it("recognises the outgoing tokens by the hash the journal recorded, even without a slot", () => {
    writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
    P.saveProfile("A");
    // B was never saved; the journal's previousTokenHash is all we have.
    const bCreds = JSON.stringify(ACCOUNT_B.creds);
    fs.writeFileSync(CREDENTIALS_PATH, bCreds);
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(ACCOUNT_A.config));
    const { createHash } = require("crypto") as typeof import("crypto");
    const previousTokenHash = createHash("sha256")
      .update(JSON.stringify(ACCOUNT_B.creds.claudeAiOauth))
      .digest("hex");
    writeJournal({ previousTokenHash });
    backdate(SWITCH_JOURNAL_PATH, 120_000);
    expect(P.findInterruptedSwitch()).not.toBeNull();
  });

  it("re-checks under the lock and restores nothing if the state changed after the prompt", () => {
    saveBothAccounts();
    staleJournal();
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(ACCOUNT_A.config));
    const pending = P.findInterruptedSwitch()!;
    expect(pending).not.toBeNull();
    // While the prompt was open the user signed in as someone else.
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify({ oauthAccount: { emailAddress: "d@x.com" } }));
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-d" } }));
    expect(P.restoreInterruptedSwitch(pending)).toEqual({ ok: true, data: "no-longer-needed" });
    expect((readJson(CLAUDE_JSON_PATH).oauthAccount as { emailAddress: string }).emailAddress).toBe("d@x.com");
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
  });
});

describe("legacy credentials backup", () => {
  const LEGACY_CREDS_BAK = `${CREDENTIALS_PATH}.bak`;

  it("is removed when found on its own", () => {
    saveBothAccounts();
    fs.writeFileSync(LEGACY_CREDS_BAK, JSON.stringify(ACCOUNT_A.creds));
    expect(P.findInterruptedSwitch()).toBeNull();
    expect(fs.existsSync(LEGACY_CREDS_BAK)).toBe(false);
  });

  it("stays with a reported legacy switch until it is restored or discarded, and is never applied", () => {
    saveBothAccounts();
    fs.writeFileSync(LEGACY_BAK_PATH, JSON.stringify(ACCOUNT_B.config));
    backdate(LEGACY_BAK_PATH, 120_000);
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(ACCOUNT_A.config));
    fs.writeFileSync(LEGACY_CREDS_BAK, JSON.stringify(ACCOUNT_A.creds));
    const pending = P.findInterruptedSwitch()!;
    expect(pending.legacy).toBe(true);
    expect(fs.existsSync(LEGACY_CREDS_BAK)).toBe(true);
    expect(P.restoreInterruptedSwitch(pending)).toEqual({ ok: true, data: "restored" });
    expect(fs.existsSync(LEGACY_CREDS_BAK)).toBe(false);
    expect((readJson(CREDENTIALS_PATH).claudeAiOauth as { accessToken: string }).accessToken).toBe("sk-ant-oat01-b1");
  });
});

describe("switchProfile — failed rollback", () => {
  it("keeps the journal and says recovery will be offered when the identity cannot be put back", () => {
    saveBothAccounts();
    fs.mkdirSync(`${CREDENTIALS_PATH}.tmp`); // credentials write fails
    atomicFail.path = CLAUDE_JSON_PATH;
    atomicFail.skip = 1; // the switch's write lands; the rollback's fails
    const result = P.switchProfile("a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain("offer to recover it the next time it starts");
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(true);
    // And the next start does offer it.
    atomicFail.path = "";
    backdate(SWITCH_JOURNAL_PATH, 120_000);
    expect(P.findInterruptedSwitch()).toMatchObject({ email: "b@x.com" });
  });
});

describe("switchProfile — Keychain freshness", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("sees a refresh that landed inside the Keychain cache window before swapping", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    keychain.value = JSON.stringify(ACCOUNT_B.creds);
    writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
    fs.rmSync(CREDENTIALS_PATH);
    keychain.value = JSON.stringify(ACCOUNT_A.creds);
    await freshHost();
    P.saveProfile("A");
    keychain.value = JSON.stringify(ACCOUNT_B.creds);
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(ACCOUNT_B.config));
    await freshHost();
    P.saveProfile("B");
    backdate(CLAUDE_JSON_PATH, 120_000);

    // Cache B's current tokens, then let Claude Code refresh them.
    expect(P.getActiveProfileSlug()).toBe("b");
    const rotated = { claudeAiOauth: { ...ACCOUNT_B.creds.claudeAiOauth, accessToken: "sk-ant-oat01-b2", expiresAt: 1_900_000_100_000 } };
    keychain.value = JSON.stringify(rotated);

    // Through the stale cache the outgoing slot looks current and the
    // refresh would be lost. Read fresh, the change is seen; it is seconds
    // old, so the switch waits rather than guess.
    const result = P.switchProfile("a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("identity-settling");
    expect(keychain.value).toBe(JSON.stringify(rotated));
  });
});

describe("refresh-token expiry units", () => {
  it("normalises a refresh-token expiry recorded in seconds", () => {
    const creds = {
      claudeAiOauth: { ...ACCOUNT_A.creds.claudeAiOauth, refreshTokenExpiresAt: 1_950_000_000 },
    };
    writeLiveAccount(ACCOUNT_A.config, creds);
    P.saveProfile("A");
    expect(P.listProfiles()[0].refreshTokenExpiresAt).toBe(1_950_000_000_000);
  });
});

describe("locked Keychain beside a leftover credentials file", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  /** Both accounts saved, B live; then the Keychain locks over a leftover file holding A. */
  async function lockKeychain(): Promise<void> {
    saveBothAccounts();
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(ACCOUNT_A.creds));
    keychain.failWith = 25;
    await freshHost();
  }

  it("still resolves the active account from the file for display", async () => {
    await lockKeychain();
    expect(P.getActiveProfileSlug()).toBe("a");
  });

  it("refuses to switch and writes nothing", async () => {
    await lockKeychain();
    const configBefore = fs.readFileSync(CLAUDE_JSON_PATH, "utf-8");
    const credsBefore = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
    const result = P.switchProfile("b");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("keychain-unavailable");
      expect(result.detail).toContain("unlock it and try again");
    }
    expect(fs.readFileSync(CLAUDE_JSON_PATH, "utf-8")).toBe(configBefore);
    expect(fs.readFileSync(CREDENTIALS_PATH, "utf-8")).toBe(credsBefore);
  });

  it("refuses to snapshot the fallback file into a slot", async () => {
    await lockKeychain();
    const result = P.updateProfile("a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("keychain-unavailable");
    expect(P.syncActiveProfile().kind).not.toBe("synced");
  });

  it("refuses to restore an interrupted switch", async () => {
    await lockKeychain();
    writeJournal();
    const pending = {
      path: SWITCH_JOURNAL_PATH,
      legacy: false,
      writtenAt: Date.now() - 120_000,
      email: "b@x.com",
    };
    const result = P.restoreInterruptedSwitch(pending);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("keychain-unavailable");
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(true);
  });
});

describe("half-switched state (journal on disk)", () => {
  /** Identity B, tokens A: the state a switch A → B leaves dying between its writes. */
  function halfSwitched(): void {
    saveBothAccounts();
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(ACCOUNT_A.creds));
    writeJournal({ previous: ACCOUNT_A.config, target: ACCOUNT_B.config });
    backdate(SWITCH_JOURNAL_PATH, 120_000);
    // Our own config write is the newest file — rule 2 would vouch for it.
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(ACCOUNT_B.config));
  }

  it("never syncs the outgoing tokens into the slot the identity names", () => {
    halfSwitched();
    const refreshed = { claudeAiOauth: { ...ACCOUNT_A.creds.claudeAiOauth, accessToken: "sk-ant-oat01-a2", expiresAt: 1_900_000_100_000 } };
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(refreshed));
    backdate(CREDENTIALS_PATH, 60_000); // settled past rule 3 as well
    expect(P.syncActiveProfile()).toEqual({ kind: "none" });
    expect(slotCreds("b").claudeAiOauth.accessToken).toBe("sk-ant-oat01-b1");
  });

  it("refuses to save or update a profile until the switch is resolved", () => {
    halfSwitched();
    for (const result of [P.updateProfile("b"), P.saveProfile("New")]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("switch-interrupted");
    }
    // So the sweep still sees the interrupted switch it must offer.
    expect(P.findInterruptedSwitch()).toMatchObject({ email: "a@x.com" });
  });

  it("a later switch that fails puts the earlier journal back", () => {
    halfSwitched();
    const earlier = fs.readFileSync(SWITCH_JOURNAL_PATH, "utf-8");
    fs.mkdirSync(`${CREDENTIALS_PATH}.tmp`); // credentials write fails
    expect(P.switchProfile("a").ok).toBe(false);
    expect(fs.readFileSync(SWITCH_JOURNAL_PATH, "utf-8")).toBe(earlier);
    expect(readJson(CLAUDE_JSON_PATH)).toEqual(ACCOUNT_B.config);
  });

  it("a later switch that succeeds resolves the mismatch and clears the journal", () => {
    halfSwitched();
    expect(P.switchProfile("a").ok).toBe(true);
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
    expect(readJson(CLAUDE_JSON_PATH)).toEqual(ACCOUNT_A.config);
    expect(readJson(CREDENTIALS_PATH).claudeAiOauth).toEqual(ACCOUNT_A.creds.claudeAiOauth);
    // The outgoing "B" slot was not overwritten with A's tokens on the way.
    expect(slotCreds("b").claudeAiOauth.accessToken).toBe("sk-ant-oat01-b1");
  });
});

describe("interrupted switch recovery — unreadable credentials", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  function interrupted(): void {
    saveBothAccounts();
    writeJournal();
    backdate(SWITCH_JOURNAL_PATH, 120_000);
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(ACCOUNT_A.config));
  }

  it("keeps the journal when the Keychain is locked", async () => {
    interrupted();
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    fs.rmSync(CREDENTIALS_PATH);
    keychain.failWith = 25;
    await freshHost();
    expect(P.findInterruptedSwitch()).toBeNull();
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(true);
  });

  it("keeps the journal when the credentials file is mid-write", () => {
    interrupted();
    fs.writeFileSync(CREDENTIALS_PATH, '{"claudeAiOauth": {');
    expect(P.findInterruptedSwitch()).toBeNull();
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(true);
  });

  it("clears it when nobody is signed in at all", () => {
    interrupted();
    fs.rmSync(CREDENTIALS_PATH);
    expect(P.findInterruptedSwitch()).toBeNull();
    expect(fs.existsSync(SWITCH_JOURNAL_PATH)).toBe(false);
  });
});

describe("syncActiveProfile — judges the bytes it writes", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("does not save a /login's new Keychain item into the old slot through a stale cache", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    fs.rmSync(CREDENTIALS_PATH, { force: true });
    keychain.value = JSON.stringify(ACCOUNT_A.creds);
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(ACCOUNT_A.config));
    P.saveProfile("A");
    backdate(CLAUDE_JSON_PATH, 120_000);
    // A long-settled refresh of A is what the cache holds…
    const refreshed = { claudeAiOauth: { ...ACCOUNT_A.creds.claudeAiOauth, accessToken: "sk-ant-oat01-a2", expiresAt: 1_900_000_100_000 } };
    keychain.value = JSON.stringify(refreshed);
    await freshHost(); // first sighting of A2: long settled
    expect(P.getActiveProfileSlug()).toBe("a"); // caches A2
    // …when /login replaces the item; ~/.claude.json still names A.
    keychain.value = JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-new", expiresAt: 1_900_000_200_000 } });
    expect(P.syncActiveProfile().kind).toBe("deferred");
    expect(slotCreds("a").claudeAiOauth.accessToken).toBe("sk-ant-oat01-a1");
  });
});

describe("credentials without an account token", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("switching into the Keychain keeps its MCP tokens and ignores a leftover file", async () => {
    writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
    P.saveProfile("A");
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const mcpOAuth = { linear: { accessToken: "l" } };
    keychain.value = JSON.stringify({ mcpOAuth });
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(ACCOUNT_B.creds)); // leftover
    await freshHost();
    // Signed out as far as display goes — no fallback to the leftover file.
    expect(P.getActiveProfileSlug()).toBeNull();

    expect(P.switchProfile("a").ok).toBe(true);
    const item = JSON.parse(keychain.value!) as Record<string, unknown>;
    expect(item.claudeAiOauth).toEqual(ACCOUNT_A.creds.claudeAiOauth);
    expect(item.mcpOAuth).toEqual(mcpOAuth);
    expect(readJson(CREDENTIALS_PATH)).toEqual(ACCOUNT_B.creds);
  });

  it("merges into a credentials file that holds only MCP tokens", () => {
    writeLiveAccount(ACCOUNT_A.config, ACCOUNT_A.creds);
    P.saveProfile("A");
    const mcpOAuth = { sentry: { accessToken: "s" } };
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ mcpOAuth }));
    expect(P.switchProfile("a").ok).toBe(true);
    expect(readJson(CREDENTIALS_PATH)).toEqual({ mcpOAuth, claudeAiOauth: ACCOUNT_A.creds.claudeAiOauth });
  });
});
