/**
 * Account profiles — snapshot and swap Claude CLI credentials so users
 * can move between multiple accounts without going through the full
 * `/logout` + `/login` browser dance each time.
 *
 * Storage layout:
 *   ~/.claude/manager-accounts/<slug>/
 *     .claude.json            — oauthAccount + userID captured at save time
 *     .credentials.json       — OAuth access/refresh tokens, expiry
 *     profile.json            — label, savedAt, accountUuid, userID, email
 *
 * Switching merges identity into live state: `oauthAccount` + `userID`
 * are overwritten from the snapshot; every other key in `~/.claude.json`
 * (projects, numStartups, migration flags, caches, onboarding, MCP
 * config, …) is preserved as-is. `~/.claude/.credentials.json` is
 * swapped wholesale because it holds only OAuth tokens.
 *
 * Active-profile detection falls through four matchers in this order:
 *   1. byte-identical credentials hash (same token = same snapshot)
 *   2. `oauthAccount.accountUuid` (account-stable; primary identity)
 *   3. `userID` + email cross-check (legacy snapshots without accountUuid)
 *   4. email (oldest snapshots, pre-userID storage)
 *
 * Why the cascade exists: Anthropic's refresh tokens are single-use
 * rotated. Once the CLI uses a saved snapshot's refresh token, the
 * server revokes it and issues a new pair into the live creds file —
 * the snapshot's bytes go stale. `syncActiveProfile()` writes the live
 * pair back into the active slot whenever creds change so the snapshot
 * never lags behind the rotation; switchProfile calls it before any
 * swap so the outgoing slot captures its freshest token before being
 * unmounted.
 *
 * About `userID` vs `accountUuid`: the top-level `userID` field in
 * `.claude.json` is device-stable (same value across accounts on one
 * machine), NOT account-distinct. `oauthAccount.accountUuid` is the
 * authoritative per-account id. Pre-fix snapshots stored userID as the
 * dedupe key, which is why the cascade still cross-checks email when
 * matching on it.
 *
 * Security: OAuth tokens are duplicated on disk, unencrypted, exactly
 * the way Claude CLI already stores them. We inherit the user's home-
 * dir permissions and surface the concern in the UI + docs. Do NOT add
 * extra copies elsewhere; every write goes under this one directory.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { CLAUDE_DIR } from "../../core/config";
import { createMtimeCache } from "../../core/mtimeCache";
import {
  readCredentials,
  writeCredentials,
  hashCredentials,
  defaultTargetSource,
  type CredentialsSource,
  type LiveCredentials,
} from "./credentials";

/**
 * Cache SHA-256 hashes by file path. listProfiles() can run on every
 * panel reload and re-hashing N saved-profile credential files plus
 * the live credentials file is wasted work when nothing has changed.
 *
 * Only used for snapshot files (always disk-resident under
 * ~/.claude/manager-accounts/<slug>/). The live credential hash comes
 * from the credentials module instead — it knows how to source from
 * file or macOS Keychain interchangeably.
 */
const hashCache = createMtimeCache<string>();

const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");
const PROFILES_DIR = path.join(CLAUDE_DIR, "manager-accounts");

/** Public per-profile metadata for the webview. Never contains tokens. */
export interface SavedProfile {
  /** URL-safe slug used as the directory name. Unique per profile. */
  slug: string;
  /** User-provided label. Displayed as the card title fallback. */
  label: string;
  /** Captured email at save time (for display + disambiguation). */
  email: string;
  /** Captured organization name (empty for personal accounts). */
  organizationName: string;
  /** Subscription tier captured when the snapshot was taken. */
  subscriptionType: string;
  /** ISO timestamp the snapshot was written. */
  savedAt: string;
  /** OAuth token expiry (ms epoch) from the snapshot. 0 if missing. */
  tokenExpiresAt: number;
  /**
   * SHA-256 of the snapshot's credentials file. Used as the primary
   * (exact) match when detecting which profile matches the live
   * `~/.claude/.credentials.json`. Secondary matchers (userID, email)
   * cover the common case where Claude CLI has rotated the token since
   * the snapshot was written, so hashes diverge but identity is stable.
   */
  credentialsHash: string;
  /**
   * Anthropic `userID` captured from the snapshot's `.claude.json`.
   * Note: this field is device-stable (same value across accounts on
   * one machine), NOT account-distinct. Kept as a secondary matcher
   * for legacy snapshots; new code should prefer `accountUuid`.
   */
  userID: string;
  /**
   * `oauthAccount.accountUuid` from the snapshot's `.claude.json` —
   * Anthropic's per-account UUID. Account-distinct and stable across
   * token rotations, so this is the primary identity key for both
   * `getActiveProfileSlug` matching and `saveProfile` dedupe. Empty
   * for snapshots taken before this field was introduced.
   */
  accountUuid: string;
}

/** Live-account identity extracted from `.claude.json` or the access token. */
interface LiveIdentity {
  /** `oauthAccount.accountUuid` — primary, account-distinct. */
  accountUuid: string;
  /** Top-level `userID` — device-stable; secondary matcher only. */
  userID: string;
  /** `oauthAccount.emailAddress`. Lowercase comparisons in matchers. */
  email: string;
}

/**
 * Slugify a free-form label into a safe directory name. Keeps letters,
 * digits, dash, and underscore; collapses other runs into `-`.
 */
function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "profile";
}

/** SHA-256 hex of a file's content, or "" when the file can't be read. */
function hashFile(filePath: string): string {
  return hashCache.get(filePath, (p) => {
    try {
      const buf = fs.readFileSync(p);
      return crypto.createHash("sha256").update(buf).digest("hex");
    } catch {
      return "";
    }
  });
}

/**
 * Read the live identity in a race-safe way: read credentials, read
 * .claude.json, re-read credentials. If credentials moved between the
 * pre- and post-read (Claude CLI mid-refresh, profile switch in flight),
 * retry once. Returns null on unrecoverable error — callers treat that
 * as "no active account".
 *
 * Credentials come through the credentials module so we transparently
 * handle the macOS Keychain backend in addition to the file backend.
 * `.claude.json` is always disk-resident across every supported
 * platform, so it stays a direct `fs.readFileSync`.
 *
 * Without this, `saveProfile` could capture claude.json with one
 * token generation and credentials with another, producing a
 * snapshot that never matches either identity cleanly.
 */
function readLivePairRaceSafe(): {
  claudeJsonRaw: string;
  credsRaw: string;
  source: CredentialsSource;
} | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    const pre = readCredentials();
    if (!pre) return null;
    let claudeJsonRaw: string;
    try {
      claudeJsonRaw = fs.readFileSync(CLAUDE_JSON, "utf-8");
    } catch {
      return null;
    }
    if (!claudeJsonRaw.trim()) return null;
    const post = readCredentials();
    if (!post) return null;
    if (post.hash === pre.hash) {
      return { claudeJsonRaw, credsRaw: post.raw, source: post.source };
    }
    // Token rotated mid-read; retry once.
  }
  return null;
}

/** Parse identity fields from a `.claude.json` payload. */
function extractIdentity(claudeJsonRaw: string): LiveIdentity {
  try {
    const parsed = JSON.parse(claudeJsonRaw) as Record<string, unknown>;
    const oauth = parsed.oauthAccount as Record<string, unknown> | undefined;
    const email = typeof oauth?.emailAddress === "string" ? oauth.emailAddress : "";
    const accountUuid = typeof oauth?.accountUuid === "string" ? oauth.accountUuid : "";
    const userID = typeof parsed.userID === "string" ? parsed.userID : "";
    return { accountUuid, userID, email };
  } catch {
    return { accountUuid: "", userID: "", email: "" };
  }
}

/**
 * Decode a JWT access token's payload (no signature verification — we
 * only need the claims for identity correlation, not auth). Returns
 * null on any parse failure; callers fall back to other identity
 * sources.
 *
 * Why this exists: during Claude CLI's `/login` flow, `.credentials.json`
 * is rewritten with the new tokens BEFORE `.claude.json` gets the new
 * `oauthAccount` + `userID` blocks. Reading identity from `.claude.json`
 * during that window returns the PREVIOUS account's identity — which
 * makes `getActiveProfileSlug` match the old saved slot, hide the
 * "Save profile" button, and mislabel the switcher's active row. The
 * JWT inside `.credentials.json` is always current; trusting it sidesteps
 * the file-write ordering entirely.
 */
function extractIdentityFromToken(credsRaw: string): LiveIdentity | null {
  try {
    const parsed = JSON.parse(credsRaw) as { claudeAiOauth?: { accessToken?: string } };
    const token = parsed.claudeAiOauth?.accessToken;
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    const claims = JSON.parse(payload) as Record<string, unknown>;
    // Claim names vary across OAuth implementations; accept the most
    // common ones and fall through silently if none present. `sub` is
    // the standard JWT subject; `account_uuid` is what Anthropic uses
    // for the per-account UUID; `email` / `email_address` for email.
    const accountUuid =
      (typeof claims.account_uuid === "string" && claims.account_uuid) || "";
    const userID =
      (typeof claims.sub === "string" && claims.sub) ||
      (typeof claims.user_id === "string" && claims.user_id) ||
      "";
    const email =
      (typeof claims.email === "string" && claims.email) ||
      (typeof claims.email_address === "string" && claims.email_address) ||
      "";
    if (!accountUuid && !userID && !email) return null;
    return { accountUuid, userID, email };
  } catch {
    return null;
  }
}

/**
 * Parse a credentials snapshot without exposing the token. Returns the
 * fields the UI needs for the saved-profile card.
 */
function readSnapshotMeta(slotDir: string): Partial<SavedProfile> {
  const out: Partial<SavedProfile> = {};

  try {
    const raw = fs.readFileSync(path.join(slotDir, "profile.json"), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.label === "string") out.label = parsed.label;
    if (typeof parsed.savedAt === "string") out.savedAt = parsed.savedAt;
    // Older snapshots may not have these in profile.json — they get
    // re-derived below from the captured .claude.json.
    if (typeof parsed.userID === "string") out.userID = parsed.userID;
    if (typeof parsed.email === "string") out.email = parsed.email;
    if (typeof parsed.accountUuid === "string") out.accountUuid = parsed.accountUuid;
  } catch {
    // Missing/corrupt metadata — we'll re-derive from the snapshot files.
  }

  try {
    const raw = fs.readFileSync(path.join(slotDir, ".claude.json"), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const oauth = parsed.oauthAccount as Record<string, unknown> | undefined;
    if (oauth) {
      if (!out.email && typeof oauth.emailAddress === "string") out.email = oauth.emailAddress;
      if (typeof oauth.organizationName === "string") {
        out.organizationName = oauth.organizationName;
      }
      if (!out.accountUuid && typeof oauth.accountUuid === "string") {
        out.accountUuid = oauth.accountUuid;
      }
    }
    if (!out.userID && typeof parsed.userID === "string") out.userID = parsed.userID;
  } catch {
    // Snapshot is incomplete; caller will decide whether to surface it.
  }

  try {
    const raw = fs.readFileSync(path.join(slotDir, ".credentials.json"), "utf-8");
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: {
        subscriptionType?: string;
        expiresAt?: number;
      };
    };
    const oauth = parsed.claudeAiOauth;
    if (oauth) {
      if (typeof oauth.subscriptionType === "string") {
        out.subscriptionType = oauth.subscriptionType;
      }
      if (typeof oauth.expiresAt === "number") {
        out.tokenExpiresAt = oauth.expiresAt;
      }
    }
  } catch {
    // ignore — caller surfaces a bad snapshot via missing credentialsHash
  }

  return out;
}

/**
 * List every saved profile. Returns [] when the directory does not
 * exist; callers treat that as "no profiles yet" (the common case on a
 * fresh install). Slots missing a credentials file are dropped — they
 * can't be switched to anyway, and surfacing them would confuse users.
 */
export function listProfiles(): SavedProfile[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(PROFILES_DIR);
  } catch {
    return [];
  }

  const out: SavedProfile[] = [];
  for (const slug of entries) {
    const slotDir = path.join(PROFILES_DIR, slug);
    try {
      if (!fs.statSync(slotDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const credHash = hashFile(path.join(slotDir, ".credentials.json"));
    if (!credHash) continue;

    const meta = readSnapshotMeta(slotDir);
    out.push({
      slug,
      label: meta.label ?? meta.email ?? slug,
      email: meta.email ?? "",
      organizationName: meta.organizationName ?? "",
      subscriptionType: meta.subscriptionType ?? "",
      savedAt: meta.savedAt ?? "",
      tokenExpiresAt: meta.tokenExpiresAt ?? 0,
      credentialsHash: credHash,
      userID: meta.userID ?? "",
      accountUuid: meta.accountUuid ?? "",
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/**
 * Read the live identity, preferring the access-token claims when the
 * token is a JWT (covers the Claude CLI `/login` window where
 * credentials are rewritten before `.claude.json`). Falls back to
 * `.claude.json` for opaque tokens — Anthropic's current production
 * tokens are `sk-ant-oat01-…` opaque strings, so this is the steady-
 * state path. Returns null when no identity can be derived.
 *
 * The credentials read goes through the source-agnostic module so
 * macOS Keychain users get the same identity-resolution behaviour as
 * file users.
 */
function readLiveIdentity(): LiveIdentity | null {
  const live = readCredentials();
  if (!live) return null;
  const tokenIdentity = extractIdentityFromToken(live.raw);
  if (tokenIdentity) return tokenIdentity;
  try {
    const claudeJsonRaw = fs.readFileSync(CLAUDE_JSON, "utf-8");
    const fromJson = extractIdentity(claudeJsonRaw);
    if (fromJson.accountUuid || fromJson.userID || fromJson.email) return fromJson;
  } catch {
    // .claude.json missing — nothing left to try.
  }
  return null;
}

/**
 * Return the slug of the profile that matches the live credentials, or
 * null when none do. Match cascade:
 *   1. credentials hash (byte-identical = same snapshot)
 *   2. accountUuid (Anthropic per-account UUID; account-distinct)
 *   3. userID + email cross-check (legacy snapshots)
 *   4. email (oldest snapshots, pre-userID storage)
 *
 * Without the cascade, Claude CLI's background token refresh would
 * silently "unsave" the active profile because the hash diverges even
 * though the account is unchanged.
 */
export function getActiveProfileSlug(
  knownProfiles?: SavedProfile[],
): string | null {
  const live = readCredentials();
  if (!live) return null;
  const liveHash = live.hash;

  // Callers that already hold the profile list (parseAccountData lists
  // it for its payload anyway) pass it in — listProfiles is O(#profiles)
  // in stats + hashes and this function runs on every account parse.
  const profiles = knownProfiles ?? listProfiles();

  // Pass 1: exact hash match.
  for (const p of profiles) {
    if (p.credentialsHash === liveHash) return p.slug;
  }

  const liveIdentity = readLiveIdentity();
  if (!liveIdentity) return null;

  // Tie-break by freshest savedAt when more than one profile matches
  // the same identity. Without this, duplicate slots (legacy state
  // before dedupe landed, or an intentional double-save) would always
  // resolve to the alphabetically-first slug — rarely what the user
  // means in the switcher. Newest wins.
  const freshestFirst = (a: SavedProfile, b: SavedProfile): number => {
    const at = Date.parse(a.savedAt || "") || 0;
    const bt = Date.parse(b.savedAt || "") || 0;
    return bt - at;
  };

  // Stage 2: accountUuid match — primary identity. Account-distinct
  // and stable across token rotations, so this is the strongest
  // matcher we have once the byte-hash pass fails.
  if (liveIdentity.accountUuid) {
    const candidates = profiles
      .filter((p) => p.accountUuid && p.accountUuid === liveIdentity.accountUuid)
      .sort(freshestFirst);
    if (candidates[0]) return candidates[0].slug;
  }

  // Stage 3: userID + email cross-check for legacy snapshots that
  // predate accountUuid storage. The `userID` field in `.claude.json`
  // is device-stable (same value across accounts on one machine), so
  // matching on it alone would collide accounts; the email cross-
  // check disambiguates.
  if (liveIdentity.userID) {
    const emailLower = liveIdentity.email.toLowerCase();
    const candidates = profiles
      .filter((p) => {
        if (!p.userID || p.userID !== liveIdentity.userID) return false;
        if (p.accountUuid) return false; // would already have matched at stage 2
        if (!p.email || !emailLower) return true;
        return p.email.toLowerCase() === emailLower;
      })
      .sort(freshestFirst);
    if (candidates[0]) return candidates[0].slug;
  }

  // Stage 4: email-only match (snapshots saved before any id storage,
  // or whose stored ids got corrupted by the pre-fix /login race).
  if (liveIdentity.email) {
    const emailLower = liveIdentity.email.toLowerCase();
    const candidates = profiles
      .filter((p) => p.email && p.email.toLowerCase() === emailLower)
      .sort(freshestFirst);
    if (candidates[0]) return candidates[0].slug;
  }

  return null;
}

/** Error codes returned from write operations. Keeps UI text stable. */
export type ProfileError =
  | "no-active-account"
  | "slug-exists"
  | "slot-missing"
  | "copy-failed"
  | "unreadable-source"
  | "already-saved";

export type ProfileResult<T> = { ok: true; data: T } | { ok: false; error: ProfileError; detail?: string };

/**
 * Snapshot the current `~/.claude.json` + `~/.claude/.credentials.json`
 * into a new slot. Fails when no active account exists (either file
 * missing / empty), when the slug collides with an existing slot, or
 * when a slot already exists for the live userID (prevents duplicate
 * accretion after Bug 1's hash-only active detection mis-fired).
 */
export function saveProfile(label: string): ProfileResult<SavedProfile> {
  const trimmed = label.trim();
  if (!trimmed) {
    return { ok: false, error: "copy-failed", detail: "Label is empty" };
  }

  const pair = readLivePairRaceSafe();
  if (!pair) {
    return { ok: false, error: "no-active-account" };
  }
  const { claudeJsonRaw, credsRaw } = pair;

  // Identity for dedupe + storage. Token claims authoritative for the
  // current credentials; .claude.json fills in fields the token omits
  // (most importantly accountUuid, which opaque Anthropic tokens
  // don't expose). Merge so we get the broadest possible identity.
  const tokenIdentity = extractIdentityFromToken(credsRaw);
  const jsonIdentity = extractIdentity(claudeJsonRaw);
  const identity: LiveIdentity = {
    accountUuid: tokenIdentity?.accountUuid || jsonIdentity.accountUuid,
    userID: tokenIdentity?.userID || jsonIdentity.userID,
    email: tokenIdentity?.email || jsonIdentity.email,
  };

  if (identity.accountUuid || identity.userID || identity.email) {
    const existing = listProfiles().find((p) => {
      if (identity.accountUuid && p.accountUuid && identity.accountUuid === p.accountUuid) {
        return true;
      }
      if (identity.userID && p.userID && identity.userID === p.userID) {
        // userID is device-stable, NOT account-distinct — matching on
        // it alone collides distinct accounts on the same machine.
        // Cross-check email so this only fires for the same account.
        if (identity.email && p.email) {
          return p.email.toLowerCase() === identity.email.toLowerCase();
        }
        return false;
      }
      if (identity.email && p.email) {
        return p.email.toLowerCase() === identity.email.toLowerCase();
      }
      return false;
    });
    if (existing) {
      return {
        ok: false,
        error: "already-saved",
        detail: existing.slug,
      };
    }
  }

  // Generate a unique slug: slugify + suffix if collision.
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  const base = slugify(trimmed);
  let slug = base;
  let attempt = 2;
  while (fs.existsSync(path.join(PROFILES_DIR, slug))) {
    slug = `${base}-${attempt++}`;
    if (attempt > 99) {
      return { ok: false, error: "slug-exists", detail: base };
    }
  }

  const slotDir = path.join(PROFILES_DIR, slug);
  try {
    fs.mkdirSync(slotDir, { recursive: true });
    fs.writeFileSync(path.join(slotDir, ".claude.json"), claudeJsonRaw);
    fs.writeFileSync(path.join(slotDir, ".credentials.json"), credsRaw);
    // Restrict permissions best-effort on POSIX. On Windows chmod is a
    // no-op; the OS access-list inherits from the parent anyway.
    try {
      fs.chmodSync(path.join(slotDir, ".credentials.json"), 0o600);
      fs.chmodSync(path.join(slotDir, ".claude.json"), 0o600);
    } catch {
      // ignore on Windows
    }
    fs.writeFileSync(
      path.join(slotDir, "profile.json"),
      JSON.stringify(
        {
          label: trimmed,
          savedAt: new Date().toISOString(),
          accountUuid: identity.accountUuid,
          userID: identity.userID,
          email: identity.email,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    return {
      ok: false,
      error: "copy-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Re-derive the full SavedProfile so the returned object matches
  // what listProfiles would produce on the next load.
  const meta = readSnapshotMeta(slotDir);
  return {
    ok: true,
    data: {
      slug,
      label: meta.label ?? trimmed,
      email: meta.email ?? identity.email,
      organizationName: meta.organizationName ?? "",
      subscriptionType: meta.subscriptionType ?? "",
      savedAt: meta.savedAt ?? new Date().toISOString(),
      tokenExpiresAt: meta.tokenExpiresAt ?? 0,
      credentialsHash: hashFile(path.join(slotDir, ".credentials.json")),
      userID: meta.userID ?? identity.userID,
      accountUuid: meta.accountUuid ?? identity.accountUuid,
    },
  };
}

/**
 * Overwrite an existing slot with the current live credentials. Used
 * when Claude CLI has refreshed tokens and the user wants to re-sync
 * the saved snapshot. Fails if the slot doesn't exist.
 */
export function updateProfile(slug: string): ProfileResult<SavedProfile> {
  const slotDir = path.join(PROFILES_DIR, slug);
  if (!fs.existsSync(slotDir)) {
    return { ok: false, error: "slot-missing", detail: slug };
  }

  const pair = readLivePairRaceSafe();
  if (!pair) {
    return { ok: false, error: "no-active-account" };
  }
  const { claudeJsonRaw, credsRaw } = pair;
  const tokenIdentity = extractIdentityFromToken(credsRaw);
  const jsonIdentity = extractIdentity(claudeJsonRaw);
  const identity: LiveIdentity = {
    accountUuid: tokenIdentity?.accountUuid || jsonIdentity.accountUuid,
    userID: tokenIdentity?.userID || jsonIdentity.userID,
    email: tokenIdentity?.email || jsonIdentity.email,
  };

  try {
    fs.writeFileSync(path.join(slotDir, ".claude.json"), claudeJsonRaw);
    fs.writeFileSync(path.join(slotDir, ".credentials.json"), credsRaw);
    // Bump savedAt in profile.json; preserve label; refresh identity.
    let label = slug;
    try {
      const existing = JSON.parse(
        fs.readFileSync(path.join(slotDir, "profile.json"), "utf-8"),
      ) as { label?: string };
      if (typeof existing.label === "string" && existing.label) {
        label = existing.label;
      }
    } catch {
      // fall through with the slug as a fallback label
    }
    fs.writeFileSync(
      path.join(slotDir, "profile.json"),
      JSON.stringify(
        {
          label,
          savedAt: new Date().toISOString(),
          accountUuid: identity.accountUuid,
          userID: identity.userID,
          email: identity.email,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    return {
      ok: false,
      error: "copy-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const meta = readSnapshotMeta(slotDir);
  return {
    ok: true,
    data: {
      slug,
      label: meta.label ?? slug,
      email: meta.email ?? identity.email,
      organizationName: meta.organizationName ?? "",
      subscriptionType: meta.subscriptionType ?? "",
      savedAt: meta.savedAt ?? new Date().toISOString(),
      tokenExpiresAt: meta.tokenExpiresAt ?? 0,
      credentialsHash: hashFile(path.join(slotDir, ".credentials.json")),
      userID: meta.userID ?? identity.userID,
      accountUuid: meta.accountUuid ?? identity.accountUuid,
    },
  };
}

/**
 * Re-snapshot the live credentials into whichever slot currently
 * matches them, if any. This is the keystone of the token-rotation
 * fix: Anthropic's refresh tokens are single-use rotated, so the
 * snapshot's bytes go stale as soon as the CLI uses them. Calling
 * this on every `~/.claude/.credentials.json` change keeps the
 * active slot byte-current with the live tokens; calling it before
 * any switch swap captures the outgoing slot's freshest pair before
 * it gets unmounted.
 *
 * Returns the updated slug, or null when no slot matched. Failures
 * are swallowed because callers can't act on them — the operation
 * is best-effort housekeeping.
 */
export function syncActiveProfile(): string | null {
  const slug = getActiveProfileSlug();
  if (!slug) return null;
  // Skip when already byte-identical: avoids spurious mtime bumps and
  // a self-triggering loop if the caller is running from a watcher.
  const slotCreds = path.join(PROFILES_DIR, slug, ".credentials.json");
  const live = readCredentials();
  if (live && hashFile(slotCreds) === live.hash) return slug;
  const result = updateProfile(slug);
  return result.ok ? slug : null;
}

/**
 * Activate the named profile. Identity keys (`oauthAccount`, `userID`)
 * are merged into the live `.claude.json`; every other key (projects,
 * numStartups, migration flags, caches, onboarding state, MCP config,
 * …) is preserved so switching doesn't roll back weeks of accumulated
 * state. Credentials are swapped wholesale because the blob is an
 * identity-only payload.
 *
 * Crash-safety:
 *   - `.claude.json` is written via tmp+rename with a `.bak` on disk —
 *     atomic on every supported platform.
 *   - Live credentials are captured in memory before the write so we
 *     can restore them if the post-write step fails. The credential
 *     write itself targets whatever source the live account currently
 *     uses (file or macOS Keychain). Keychain writes are atomic per
 *     item from the kernel's perspective; the file backend uses
 *     tmp+rename inside the credentials module.
 *   - If the credentials write fails we roll back `.claude.json` from
 *     the backup so identity + tokens never end up out of sync.
 *
 * Caller is responsible for user confirmation and for warning about
 * running Claude processes. This function does not itself prompt.
 */
export function switchProfile(slug: string): ProfileResult<SavedProfile> {
  const slotDir = path.join(PROFILES_DIR, slug);
  const slotClaudeJson = path.join(slotDir, ".claude.json");
  const slotCreds = path.join(slotDir, ".credentials.json");

  if (!fs.existsSync(slotClaudeJson) || !fs.existsSync(slotCreds)) {
    return { ok: false, error: "slot-missing", detail: slug };
  }

  // Capture the outgoing account's freshest tokens into its slot
  // before we replace the live identity. Without this, any rotation
  // that happened while the outgoing account was active stays only
  // in the live credentials — the slot keeps the original (now
  // server-revoked) refresh token, and switching back to it later
  // produces a 401. Best-effort: a write failure here doesn't block
  // the switch the user requested.
  try {
    const activeSlug = getActiveProfileSlug();
    if (activeSlug && activeSlug !== slug) {
      updateProfile(activeSlug);
    }
  } catch {
    // best-effort: never fail the user's switch on housekeeping
  }

  let mergedClaudeJson: string;
  let credsRaw: string;
  try {
    const snapClaudeRaw = fs.readFileSync(slotClaudeJson, "utf-8");
    credsRaw = fs.readFileSync(slotCreds, "utf-8");
    const snap = JSON.parse(snapClaudeRaw) as Record<string, unknown>;
    JSON.parse(credsRaw); // validate only

    // Read live as a plain object (tolerate empty / corrupt by starting
    // from the snapshot's non-identity keys — i.e. treat snapshot as
    // the whole file when live is unusable). In the common case, live
    // parses fine and we preserve everything except the two identity
    // keys.
    let live: Record<string, unknown> = {};
    try {
      const liveRaw = fs.readFileSync(CLAUDE_JSON, "utf-8");
      if (liveRaw.trim()) live = JSON.parse(liveRaw) as Record<string, unknown>;
    } catch {
      // empty/corrupt — fall back to snapshot verbatim below
    }

    const merged: Record<string, unknown> =
      Object.keys(live).length > 0 ? { ...live } : { ...snap };
    // Swap identity keys only. These are the ONLY two top-level keys
    // that encode which account the CLI thinks it's running as.
    //
    // The `oauthAccount` + `userID` pair must stay consistent after
    // the swap: if we set oauthAccount from the snapshot but leave
    // userID from the live account, the CLI sees a mismatched pair
    // until its next launch rewrites userID from the token. To avoid
    // that transient inconsistency, we:
    //   - always swap oauthAccount when the snapshot has one
    //   - drop the live userID whenever we've swapped oauthAccount
    //     without a matching snapshot userID (rare: very old
    //     snapshots predate userID storage). CLI repopulates userID
    //     on next launch, so "unset" is a cleaner momentary state
    //     than "belongs to the previous account".
    if (snap.oauthAccount !== undefined) {
      merged.oauthAccount = snap.oauthAccount;
      if (snap.userID !== undefined) {
        merged.userID = snap.userID;
      } else {
        delete merged.userID;
      }
    } else if (snap.userID !== undefined) {
      // Snapshot has no oauthAccount but does have a userID —
      // exotic shape, but swap userID anyway for consistency.
      merged.userID = snap.userID;
    }
    mergedClaudeJson = JSON.stringify(merged, null, 2);
  } catch (err) {
    return {
      ok: false,
      error: "unreadable-source",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Capture live credentials in memory BEFORE touching anything on
  // disk or in Keychain. This is our only rollback for the keychain
  // backend (which has no atomic rename), and it doubles as the
  // file-backend rollback for the credentials side. The capture also
  // pins the source we'll write to — switching the credential store
  // mid-flight would be a user-visible surprise.
  const liveBefore = readCredentials();
  const targetSource: CredentialsSource = liveBefore
    ? liveBefore.source
    : defaultTargetSource();

  // .claude.json tmp+rename with .bak backup. Same crash-safety the
  // original code provided — this side is always file-backed.
  const claudeJsonTmp = CLAUDE_JSON + ".tmp";
  const claudeJsonBak = CLAUDE_JSON + ".bak";

  for (const p of [claudeJsonTmp, claudeJsonBak]) {
    try { fs.rmSync(p, { force: true }); } catch { /* ignore */ }
  }

  let claudeJsonExistedBefore = false;
  try {
    fs.writeFileSync(claudeJsonTmp, mergedClaudeJson);
    claudeJsonExistedBefore = fs.existsSync(CLAUDE_JSON);
    if (claudeJsonExistedBefore) fs.copyFileSync(CLAUDE_JSON, claudeJsonBak);

    try {
      fs.renameSync(claudeJsonTmp, CLAUDE_JSON);
    } catch (err) {
      try { fs.rmSync(claudeJsonTmp, { force: true }); } catch { /* ignore */ }
      try { fs.rmSync(claudeJsonBak, { force: true }); } catch { /* ignore */ }
      throw err;
    }
  } catch (err) {
    return {
      ok: false,
      error: "copy-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Write credentials to the source the live account currently uses.
  // On macOS this is typically Keychain; everywhere else it's the
  // file. The credentials module hides the difference.
  const credsWritten = writeCredentials(credsRaw, targetSource);
  if (!credsWritten) {
    // Roll back .claude.json so the user is not left with the new
    // identity pointing at the old account's tokens.
    if (claudeJsonExistedBefore) {
      try { fs.copyFileSync(claudeJsonBak, CLAUDE_JSON); } catch { /* best-effort */ }
    } else {
      try { fs.rmSync(CLAUDE_JSON, { force: true }); } catch { /* best-effort */ }
    }
    try { fs.rmSync(claudeJsonBak, { force: true }); } catch { /* ignore */ }
    return {
      ok: false,
      error: "copy-failed",
      detail: `Failed to write credentials to ${targetSource.kind}.`,
    };
  }

  // Both writes succeeded — drop the .claude.json backup.
  try { fs.rmSync(claudeJsonBak, { force: true }); } catch { /* ignore */ }

  const meta = readSnapshotMeta(slotDir);
  const liveAfter = readCredentials();
  return {
    ok: true,
    data: {
      slug,
      label: meta.label ?? slug,
      email: meta.email ?? "",
      organizationName: meta.organizationName ?? "",
      subscriptionType: meta.subscriptionType ?? "",
      savedAt: meta.savedAt ?? "",
      tokenExpiresAt: meta.tokenExpiresAt ?? 0,
      credentialsHash: liveAfter
        ? liveAfter.hash
        : hashCredentials(credsRaw),
      userID: meta.userID ?? "",
      accountUuid: meta.accountUuid ?? "",
    },
  };
}

/**
 * Permanently delete a profile slot. Returns ok even when the slot
 * doesn't exist — caller just wants the end state ("gone"), and a
 * spurious error would confuse the delete-retry UX.
 */
export function removeProfile(slug: string): ProfileResult<null> {
  const slotDir = path.join(PROFILES_DIR, slug);
  try {
    fs.rmSync(slotDir, { recursive: true, force: true });
    return { ok: true, data: null };
  } catch (err) {
    return {
      ok: false,
      error: "copy-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
