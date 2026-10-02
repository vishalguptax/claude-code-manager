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
 * config, …) is preserved as-is. In the credentials only the account's
 * `claudeAiOauth` is swapped; machine state beside it (`mcpOAuth`) stays.
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
import { CLAUDE_DIR, CLAUDE_JSON_FILE } from "../../core/config";
import { createMtimeCache } from "../../core/mtimeCache";
import { describeReadRefusal, readJsonObjectForWrite, writeFileAtomic } from "../../core/atomicWrite";
import { readClaudeJsonRaw } from "./claudeJsonCache";
import {
  readCredentials,
  writeCredentials,
  hashCredentials,
  defaultTargetSource,
  credentialsChangedAt,
  readCredentialsForWrite,
  KEYCHAIN_UNAVAILABLE_MESSAGE,
  type CredentialsSource,
  type LiveCredentials,
} from "./credentials";
import {
  withLocks,
  isLockHeld,
  describeLockFailure,
  CONFIG_LOCK,
  CREDENTIAL_LOCKS,
} from "../../core/claudeLocks";

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

const PROFILES_DIR = path.join(CLAUDE_DIR, "manager-accounts");

/**
 * Crash journal for an in-flight switch: the outgoing identity, written
 * before `~/.claude.json` is touched and removed once the credentials land.
 * The name is ours alone, so the startup sweep never mistakes a user's or
 * another tool's `~/.claude.json.bak` for an interrupted switch — and a
 * switch can clear a leftover journal without deleting someone else's file.
 */
const SWITCH_JOURNAL = `${CLAUDE_JSON_FILE}.claude-manager-switch.bak`;
/**
 * What earlier versions wrote: a full copy of `~/.claude.json`. The name is
 * generic, so only a file matching an interrupted switch's exact signature
 * is acted on (see `findInterruptedSwitch`); anything else is left alone.
 */
const LEGACY_SWITCH_BACKUP = `${CLAUDE_JSON_FILE}.bak`;
/**
 * The credentials copy those versions could leave beside it: plaintext
 * tokens, and never something a restore should apply (it would roll back
 * refresh tokens rotated since). The name is ours, so it is removed.
 */
const LEGACY_CREDENTIALS_BACKUP = path.join(CLAUDE_DIR, ".credentials.json.bak");

/**
 * Every lock a switch takes, in Claude Code's acquisition order: credentials
 * (primary, legacy), then config. One fixed order for every caller, so two of
 * our own writers can never deadlock each other.
 */
const SWITCH_LOCKS = [...CREDENTIAL_LOCKS, CONFIG_LOCK];

/**
 * The only top-level `~/.claude.json` keys that say which account the CLI
 * runs as. A switch swaps these and nothing else.
 */
const IDENTITY_KEYS = ["oauthAccount", "userID"] as const;
type IdentityKeys = Partial<Record<(typeof IDENTITY_KEYS)[number], unknown>>;

/**
 * How long a credentials change may stay newer than `~/.claude.json` before
 * we stop expecting `/login` to follow it with the new identity. The CLI
 * writes the tokens, fetches the profile over the network, then writes
 * `oauthAccount` — seconds on a slow link. 30s leaves ample margin while
 * holding off a plain token refresh (which never rewrites the identity) only
 * briefly.
 */
const IDENTITY_SETTLE_MS = 30_000;

/** The journal must be this old before the sweep treats its switch as dead. */
const INTERRUPTED_SWITCH_MIN_AGE_MS = 60_000;

/**
 * Write a slot file atomically and owner-only. Slots hold OAuth tokens, and a
 * crash mid-write would leave a truncated snapshot that can never be
 * switched to again.
 */
function writeSlotFile(filePath: string, data: string): void {
  writeFileAtomic(filePath, data);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // chmod is a no-op on Windows; the profile directory's ACL applies.
  }
}

/**
 * `~/.claude.json`, read fresh — never from the mtime cache, because callers
 * hold the config lock and must merge into exactly what is on disk now —
 * under the shared refusal rule (readJsonObjectForWrite).
 *   - `config: null` — nothing there: the file does not exist, or is empty
 *                      and has stayed so past the settle window. Either way
 *                      there is no identity to keep or judge.
 *   - `ok: false`   — refused: emptied by a rewrite in progress, unreadable,
 *                     or not a JSON object. Never a reason to substitute
 *                     something else for the user's config.
 */
type LiveConfigRead =
  | { ok: true; config: Record<string, unknown> | null }
  | { ok: false; detail: string };

function readLiveConfig(): LiveConfigRead {
  const read = readJsonObjectForWrite(CLAUDE_JSON_FILE);
  if (!read.ok) return { ok: false, detail: describeReadRefusal("~/.claude.json", read) };
  const empty = read.raw === null || read.raw.trim() === "";
  return { ok: true, config: empty ? null : read.data };
}

function pickIdentity(config: Record<string, unknown>): IdentityKeys {
  const out: IdentityKeys = {};
  for (const key of IDENTITY_KEYS) {
    if (config[key] !== undefined) out[key] = config[key];
  }
  return out;
}

/** `config` carrying exactly `identity`'s keys: present ones set, absent ones removed. */
function withIdentity(
  config: Record<string, unknown>,
  identity: IdentityKeys,
): Record<string, unknown> {
  const out = { ...config };
  for (const key of IDENTITY_KEYS) {
    if (identity[key] === undefined) delete out[key];
    else out[key] = identity[key];
  }
  return out;
}

function serializeConfig(config: Record<string, unknown>): string {
  return JSON.stringify(config, null, 2);
}

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
   * When the snapshot's refresh token stops working (ms epoch), 0 if the
   * CLI did not record it. Past this the slot cannot sign in at all — the
   * access-token expiry above only means "will refresh on next use".
   */
  refreshTokenExpiresAt: number;
  /**
   * SHA-256 of the snapshot's `claudeAiOauth` tokens (see `tokenHash`).
   * Used as the primary (exact) match when detecting which profile
   * matches the live credentials. Secondary matchers (userID, email)
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

/**
 * SHA-256 of a credentials blob's `claudeAiOauth` — the account's tokens and
 * nothing else. Slot matching keys on this rather than on the whole blob
 * because the rest (`mcpOAuth` above all) is machine state that changes
 * whenever an MCP connector signs in, and a switch writes the slot's
 * `claudeAiOauth` into the live blob without the slot's other keys. Falls
 * back to the raw bytes for a blob that does not parse, so a corrupt slot
 * still lists (and fails loudly on switch) instead of vanishing.
 */
function tokenHash(credsRaw: string): string {
  try {
    const parsed = JSON.parse(credsRaw) as { claudeAiOauth?: unknown };
    return hashCredentials(JSON.stringify(parsed.claudeAiOauth ?? null));
  } catch {
    return hashCredentials(credsRaw);
  }
}

/** `tokenHash` of a slot's credentials file, or "" when it can't be read. */
function slotTokenHash(filePath: string): string {
  return hashCache.get(filePath, (p) => {
    try {
      return tokenHash(fs.readFileSync(p, "utf-8"));
    } catch {
      return "";
    }
  });
}

/**
 * Read the live identity in a race-safe way: read credentials, read
 * .claude.json, re-read credentials. If credentials moved between the
 * pre- and post-read (Claude CLI mid-refresh, profile switch in flight),
 * retry once. Returns a refusal when nobody is signed in, or when the
 * macOS Keychain cannot be read — a snapshot taken from the fallback file
 * then could save a stale account's tokens.
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
function readLivePairRaceSafe():
  | { ok: true; claudeJsonRaw: string; credsRaw: string; source: CredentialsSource }
  | { ok: false; error: ProfileError; detail?: string } {
  const noAccount = { ok: false as const, error: "no-active-account" as const };
  // Fresh reads: through the Keychain cache, pre and post would be the
  // same cached value and the race check would compare it with itself.
  const read = (): LiveCredentials | { ok: false; error: ProfileError; detail?: string } => {
    const status = readCredentialsForWrite();
    if (status.state === "ok") return status.live;
    if (status.state === "keychain-unavailable") {
      return { ok: false, error: "keychain-unavailable", detail: KEYCHAIN_UNAVAILABLE_MESSAGE };
    }
    return noAccount;
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const pre = read();
    if ("ok" in pre) return pre;
    const claudeJsonRaw = readClaudeJsonRaw();
    if (claudeJsonRaw === null || !claudeJsonRaw.trim()) return noAccount;
    const post = read();
    if ("ok" in post) return post;
    if (post.hash === pre.hash) {
      return { ok: true, claudeJsonRaw, credsRaw: post.raw, source: post.source };
    }
    // Token rotated mid-read; retry once.
  }
  return noAccount;
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
 * An epoch timestamp in ms, accepting seconds too. Claude Code writes ms,
 * but nothing guarantees the refresh-token expiry keeps that unit; read as
 * ms, a seconds value lands in January 1970 and every saved login would
 * show as expired. Any value below 1e12 (September 2001 in ms; year 33658
 * in seconds) can only be seconds.
 */
function toEpochMs(value: number): number {
  return value > 0 && value < 1e12 ? value * 1000 : value;
}

/** `claudeAiOauth.expiresAt` of a credentials blob, or 0 when absent. */
function accessTokenExpiry(credsRaw: string): number {
  try {
    const expiry = (JSON.parse(credsRaw) as { claudeAiOauth?: { expiresAt?: unknown } })
      .claudeAiOauth?.expiresAt;
    return typeof expiry === "number" ? expiry : 0;
  } catch {
    return 0;
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
        refreshTokenExpiresAt?: number;
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
      if (typeof oauth.refreshTokenExpiresAt === "number") {
        out.refreshTokenExpiresAt = toEpochMs(oauth.refreshTokenExpiresAt);
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
    const credHash = slotTokenHash(path.join(slotDir, ".credentials.json"));
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
      refreshTokenExpiresAt: meta.refreshTokenExpiresAt ?? 0,
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
  const claudeJsonRaw = readClaudeJsonRaw();
  if (claudeJsonRaw !== null) {
    const fromJson = extractIdentity(claudeJsonRaw);
    if (fromJson.accountUuid || fromJson.userID || fromJson.email) return fromJson;
  }
  return null;
}

/**
 * `accountUuid` of the account whose credentials are live right now, or
 * "" when nobody is signed in (or the credential predates the field).
 *
 * Exposed separately from `getActiveProfileSlug` because callers that
 * only need identity should not pay for the profile scan: resolving a
 * slug stats and hashes every saved snapshot, while this reads the one
 * credential file. The quota recorder runs on every statusline render,
 * which is every turn of an active session.
 */
export function readLiveAccountUuid(): string {
  return readLiveIdentity()?.accountUuid ?? "";
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
  const liveHash = tokenHash(live.raw);

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
  | "already-saved"
  /** Claude Code holds a lock on the files a switch writes (see claudeLocks). */
  | "locked"
  /** Live `~/.claude.json` or credentials exist but cannot be parsed; writing would clobber them. */
  | "live-unreadable"
  /** The live tokens are an older generation than the slot already holds. */
  | "stale-source"
  /** Live tokens just changed and their owner is not yet certain (see syncActiveProfile). */
  | "identity-settling"
  /** macOS Keychain locked or unreachable: a write would act on a stale fallback file. */
  | "keychain-unavailable";

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
  if (!pair.ok) return pair;
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
    // Owner-only directory: each file sits at the default mode for the
    // moment between its atomic rename and its chmod.
    fs.mkdirSync(slotDir, { recursive: true, mode: 0o700 });
    writeSlotFile(path.join(slotDir, ".claude.json"), claudeJsonRaw);
    writeSlotFile(path.join(slotDir, ".credentials.json"), credsRaw);
    writeSlotFile(
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
      refreshTokenExpiresAt: meta.refreshTokenExpiresAt ?? 0,
      credentialsHash: slotTokenHash(path.join(slotDir, ".credentials.json")),
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
  if (!pair.ok) return pair;
  const { claudeJsonRaw, credsRaw } = pair;

  // Never trade a slot's tokens for an older generation of the same login.
  // Each refresh issues an access token expiring later than the last, so
  // `expiresAt` orders generations; an older live pair (a session still
  // holding pre-refresh tokens, say) carries a refresh token the server has
  // most likely rotated away already, and saving it would brick the slot.
  const slotExpiry = readSnapshotMeta(slotDir).tokenExpiresAt ?? 0;
  const liveExpiry = accessTokenExpiry(credsRaw);
  if (slotExpiry && liveExpiry && liveExpiry < slotExpiry) {
    return {
      ok: false,
      error: "stale-source",
      detail: "The live sign-in is older than the one already saved in this profile",
    };
  }

  const tokenIdentity = extractIdentityFromToken(credsRaw);
  const jsonIdentity = extractIdentity(claudeJsonRaw);
  const identity: LiveIdentity = {
    accountUuid: tokenIdentity?.accountUuid || jsonIdentity.accountUuid,
    userID: tokenIdentity?.userID || jsonIdentity.userID,
    email: tokenIdentity?.email || jsonIdentity.email,
  };

  try {
    writeSlotFile(path.join(slotDir, ".claude.json"), claudeJsonRaw);
    writeSlotFile(path.join(slotDir, ".credentials.json"), credsRaw);
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
    writeSlotFile(
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
      refreshTokenExpiresAt: meta.refreshTokenExpiresAt ?? 0,
      credentialsHash: slotTokenHash(path.join(slotDir, ".credentials.json")),
      userID: meta.userID ?? identity.userID,
      accountUuid: meta.accountUuid ?? identity.accountUuid,
    },
  };
}

/** What `syncActiveProfile` did, so a watcher knows whether to look again. */
type SyncOutcome =
  /** No saved slot belongs to the live account (or nobody is signed in). */
  | { kind: "none" }
  /** The matching slot already holds the live tokens. */
  | { kind: "current"; slug: string }
  /** The matching slot was rewritten with the live tokens. */
  | { kind: "synced"; slug: string }
  /** Not yet safe to tell whose tokens are live; ask again after `retryInMs`. */
  | { kind: "deferred"; retryInMs: number };

/**
 * Whether `~/.claude.json`'s identity can be trusted to describe `live`.
 *
 * Opaque production tokens carry no identity, so the slot to sync into comes
 * from `~/.claude.json` — and during `/login` the CLI writes the NEW tokens
 * before it writes the new `oauthAccount`. Trusting the file in that window
 * files the new account's tokens under the old account's slot. The rule:
 *   1. a token that names its own account (JWT claims) is always trusted;
 *   2. `~/.claude.json` written at or after the credentials last changed is
 *      trusted — it was updated knowing about these tokens;
 *   3. credentials that changed IDENTITY_SETTLE_MS ago or longer are trusted
 *      — `/login` would have written the new identity by now, so the change
 *      was a token refresh, which keeps the account;
 * and otherwise we wait. The identity write that ends `/login` fires the
 * account watcher again, so the wait normally ends with that event.
 */
function identityVouchesFor(live: LiveCredentials): true | { retryInMs: number } {
  if (extractIdentityFromToken(live.raw)) return true;
  const changedAt = credentialsChangedAt(live);
  let configMtime = -Infinity;
  try {
    configMtime = fs.statSync(CLAUDE_JSON_FILE).mtimeMs;
  } catch {
    // No config file: it cannot vouch for anything; only age can.
  }
  if (configMtime >= changedAt) return true;
  // Clamped at 0: a sub-millisecond file mtime can sit just past Date.now().
  const age = Math.max(0, Date.now() - changedAt);
  return age >= IDENTITY_SETTLE_MS ? true : { retryInMs: Math.ceil(IDENTITY_SETTLE_MS - age) };
}

/**
 * Re-snapshot the live credentials into whichever slot currently
 * matches them, if any. This is the keystone of the token-rotation
 * fix: Anthropic's refresh tokens are single-use rotated, so the
 * snapshot's bytes go stale as soon as the CLI uses them. Calling
 * this on every credentials change keeps the active slot current with
 * the live tokens; calling it before any switch swap captures the
 * outgoing slot's freshest pair before it gets unmounted.
 *
 * Writes only when the slot is known to belong to the live tokens (see
 * `identityVouchesFor`); when unsure it reports `deferred` instead, because
 * a skipped sync is caught up later while a wrong one destroys a profile.
 * Failures are swallowed — this is best-effort housekeeping.
 */
export function syncActiveProfile(): SyncOutcome {
  const live = readCredentials();
  if (!live) return { kind: "none" };
  const profiles = listProfiles();
  // Checked before trust: tokens already in a slot need no identity at all,
  // and this is what keeps our own just-finished switch from looking like a
  // credentials change of unknown ownership.
  const liveHash = tokenHash(live.raw);
  const exact = profiles.find((p) => p.credentialsHash === liveHash);
  if (exact) return { kind: "current", slug: exact.slug };
  const slug = getActiveProfileSlug(profiles);
  if (!slug) return { kind: "none" };
  const trust = identityVouchesFor(live);
  if (trust !== true) return { kind: "deferred", retryInMs: trust.retryInMs };
  return updateProfile(slug).ok ? { kind: "synced", slug } : { kind: "none" };
}

/**
 * The live credentials blob with `claudeAiOauth` replaced by the slot's.
 *
 * Only `claudeAiOauth` belongs to an account. Everything else in the blob —
 * notably `mcpOAuth`, the tokens of every MCP connector the user has
 * authorised — is machine state; swapping it from a snapshot would drop the
 * connectors added since and resurrect refresh tokens already consumed.
 * Returns null when live credentials exist but cannot be parsed: merging
 * into them blind would lose exactly that state.
 */
function mergeAccountTokens(liveRaw: string | null, slotOauth: unknown): string | null {
  let base: Record<string, unknown> = {};
  if (liveRaw !== null) {
    try {
      const parsed = JSON.parse(liveRaw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      base = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return JSON.stringify({ ...base, claudeAiOauth: slotOauth });
}

/**
 * The live config with the snapshot's identity swapped in.
 *
 * The `oauthAccount` + `userID` pair must stay consistent: if we set
 * oauthAccount from the snapshot but left userID from the live account,
 * the CLI would see a mismatched pair until its next launch rewrites
 * userID. So oauthAccount is always swapped when the snapshot has one,
 * and the live userID is dropped when the snapshot has none (very old
 * snapshots predate userID storage) — "unset" is a cleaner momentary
 * state than "belongs to the previous account".
 */
function mergeSnapshotIdentity(
  live: Record<string, unknown>,
  snap: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...live };
  if (snap.oauthAccount !== undefined) {
    merged.oauthAccount = snap.oauthAccount;
    if (snap.userID !== undefined) merged.userID = snap.userID;
    else delete merged.userID;
  } else if (snap.userID !== undefined) {
    // Exotic shape (userID without oauthAccount); swap it for consistency.
    merged.userID = snap.userID;
  }
  return merged;
}

/** On-disk shape of SWITCH_JOURNAL. */
interface SwitchJournal {
  claudeManagerSwitch: 1;
  /** The outgoing identity keys, exactly as they were. */
  previous: IdentityKeys;
  /** The identity keys the switch wrote. */
  target: IdentityKeys;
  /** `tokenHash` of the credentials being replaced. */
  previousTokenHash: string;
  /** `tokenHash` of the credentials the switch was about to write. */
  targetTokenHash: string;
}

/**
 * Put `previous` back as the identity in `~/.claude.json`, touching no other
 * key. Restoring a whole earlier copy instead would roll back every project
 * trust decision and MCP approval recorded since it was taken.
 */
function restoreIdentity(previous: IdentityKeys): ProfileResult<null> {
  const live = readLiveConfig();
  if (!live.ok) return { ok: false, error: "live-unreadable", detail: live.detail };
  try {
    writeFileAtomic(CLAUDE_JSON_FILE, serializeConfig(withIdentity(live.config ?? {}, previous)));
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: "copy-failed", detail: (err as Error).message };
  }
}

function removeQuietly(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup; a leftover journal is surfaced by the sweep.
  }
}

/**
 * The swap itself. Runs under SWITCH_LOCKS, so Claude Code cannot refresh
 * the tokens or rewrite `~/.claude.json` between our reads and our writes.
 */
function swapUnderLocks(snap: Record<string, unknown>, slotOauth: unknown): ProfileResult<null> {
  // Refuse up front behind a locked Keychain: every read below would fall
  // back to a file the CLI is not using. This read also refills the
  // Keychain cache before the sync below reads through it — a value cached
  // up to 3s ago could predate a refresh, and the outgoing slot would then
  // miss its newest refresh token.
  if (readCredentialsForWrite().state === "keychain-unavailable") {
    return { ok: false, error: "keychain-unavailable", detail: KEYCHAIN_UNAVAILABLE_MESSAGE };
  }

  // Capture the outgoing account's freshest tokens into its slot before we
  // replace the live identity. Without this, any rotation that happened
  // while it was active stays only in the live credentials, and switching
  // back to it later restores a server-revoked refresh token (401).
  let outgoing: SyncOutcome = { kind: "none" };
  try {
    outgoing = syncActiveProfile();
  } catch {
    // best-effort: never fail the user's switch on housekeeping
  }
  if (outgoing.kind === "deferred") {
    // Swapping now would either skip that capture or file these tokens
    // under the wrong account. A few seconds' wait costs neither.
    return {
      ok: false,
      error: "identity-settling",
      detail: "Claude Code just changed the signed-in account's tokens. Try again in a few seconds",
    };
  }

  const config = readLiveConfig();
  if (!config.ok) return { ok: false, error: "live-unreadable", detail: config.detail };

  // Read past the Keychain cache: under the credential locks this is the
  // pair we are about to replace, and the cache may predate a refresh.
  const credsBefore = readCredentialsForWrite();
  if (credsBefore.state === "keychain-unavailable") {
    return { ok: false, error: "keychain-unavailable", detail: KEYCHAIN_UNAVAILABLE_MESSAGE };
  }
  if (credsBefore.state === "transient") {
    return {
      ok: false,
      error: "live-unreadable",
      detail: "Claude Code's credentials are momentarily unreadable. Try again in a moment",
    };
  }
  const liveCreds = credsBefore.state === "ok" ? credsBefore.live : null;
  const newCredsRaw = mergeAccountTokens(liveCreds?.raw ?? null, slotOauth);
  if (newCredsRaw === null) {
    return {
      ok: false,
      error: "live-unreadable",
      detail: "The live credentials are not valid JSON, so the switch would lose your MCP sign-ins",
    };
  }
  // Pin the store the live account uses; switching it mid-flight would be
  // a user-visible surprise.
  const targetSource: CredentialsSource = liveCreds ? liveCreds.source : defaultTargetSource();

  // A genuinely absent config (fresh install, or the user removed it) gets
  // the identity keys alone. The snapshot's other keys are frozen at save
  // time — copying them in would silently re-grant project trust and MCP
  // approvals the user may have revoked since; Claude Code fills in its own
  // defaults on next launch.
  const mergedConfig = mergeSnapshotIdentity(config.config ?? {}, snap);

  // Journal first: if we die between the two writes below, the startup
  // sweep can put the outgoing identity back to match the tokens that never
  // got replaced.
  const journal: SwitchJournal = {
    claudeManagerSwitch: 1,
    previous: pickIdentity(config.config ?? {}),
    target: pickIdentity(mergedConfig),
    previousTokenHash: liveCreds ? tokenHash(liveCreds.raw) : "",
    targetTokenHash: tokenHash(newCredsRaw),
  };
  try {
    writeFileAtomic(SWITCH_JOURNAL, JSON.stringify(journal, null, 2));
    writeFileAtomic(CLAUDE_JSON_FILE, serializeConfig(mergedConfig));
  } catch (err) {
    removeQuietly(SWITCH_JOURNAL);
    return { ok: false, error: "copy-failed", detail: (err as Error).message };
  }

  /**
   * Undo the identity write. The journal goes only once the undo has
   * landed: if it fails, the journal is what lets the next start offer the
   * recovery, and the returned detail says so.
   */
  const rollBack = (detail: string): string => {
    let undone: boolean;
    if (config.config === null) {
      try {
        fs.rmSync(CLAUDE_JSON_FILE, { force: true });
        undone = true;
      } catch {
        undone = false;
      }
    } else {
      undone = restoreIdentity(journal.previous).ok;
    }
    if (undone) {
      removeQuietly(SWITCH_JOURNAL);
      return detail;
    }
    return `${detail.replace(/\.$/, "")}. ~/.claude.json could not be put back, so it may name a different account than the one signed in; Claude Code Manager will offer to recover it the next time it starts.`;
  };

  // Last look before overwriting the tokens. A writer that ignores the
  // locks may have rotated them since we read; overwriting would discard a
  // refresh token the server has already rotated away from ours.
  const credsNow = readCredentialsForWrite();
  const nowHash = credsNow.state === "ok" ? credsNow.live.hash : null;
  if (nowHash !== (liveCreds?.hash ?? null)) {
    return {
      ok: false,
      error: "identity-settling",
      detail: rollBack("Claude Code changed its credentials during the switch. Try again in a moment"),
    };
  }

  // On macOS this is typically the Keychain; elsewhere the file. The
  // credentials module hides the difference.
  if (!writeCredentials(newCredsRaw, targetSource)) {
    // Never leave the new identity pointing at the old account's tokens.
    return {
      ok: false,
      error: "copy-failed",
      detail: rollBack(`Failed to write credentials to ${targetSource.kind}.`),
    };
  }
  removeQuietly(SWITCH_JOURNAL);
  return { ok: true, data: null };
}

/**
 * Activate the named profile. Identity keys (`oauthAccount`, `userID`)
 * are merged into the live `.claude.json`; every other key (projects,
 * numStartups, migration flags, caches, onboarding state, MCP config,
 * …) is preserved so switching doesn't roll back weeks of accumulated
 * state. In the credentials only `claudeAiOauth` is swapped (see
 * `mergeAccountTokens`).
 *
 * Refuses rather than guesses when `~/.claude.json` exists but cannot be
 * parsed (a write in progress, most often): falling back to the snapshot
 * would replace the user's whole config with a stale copy.
 *
 * Crash-safety: both writes are atomic; a journal of the outgoing identity
 * covers the gap between them (see `findInterruptedSwitch`), and a failed
 * credentials write rolls the identity back in-process.
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

  let snap: Record<string, unknown>;
  let slotOauth: unknown;
  try {
    snap = JSON.parse(fs.readFileSync(slotClaudeJson, "utf-8")) as Record<string, unknown>;
    const slotBlob = JSON.parse(fs.readFileSync(slotCreds, "utf-8")) as {
      claudeAiOauth?: unknown;
    };
    if (!slotBlob.claudeAiOauth || typeof slotBlob.claudeAiOauth !== "object") {
      throw new Error("Saved profile has no sign-in tokens");
    }
    slotOauth = slotBlob.claudeAiOauth;
  } catch (err) {
    return {
      ok: false,
      error: "unreadable-source",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const locked = withLocks(SWITCH_LOCKS, () => swapUnderLocks(snap, slotOauth));
  if (!locked.ok) {
    return { ok: false, error: "locked", detail: describeLockFailure(locked.failure) };
  }
  if (!locked.value.ok) return locked.value;

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
      refreshTokenExpiresAt: meta.refreshTokenExpiresAt ?? 0,
      credentialsHash: liveAfter ? tokenHash(liveAfter.raw) : slotTokenHash(slotCreds),
      userID: meta.userID ?? "",
      accountUuid: meta.accountUuid ?? "",
    },
  };
}

/** A switch journal (or legacy backup) the startup sweep should ask about. */
interface InterruptedSwitch {
  path: string;
  /** Written by an earlier version as a full copy of `~/.claude.json`. */
  legacy: boolean;
  /** When the backup was written (ms epoch). */
  writtenAt: number;
  /** Email of the account a restore would put back, or "" when unknown. */
  email: string;
}

/** What a journal (or legacy full-copy backup) recorded about its switch. */
interface SwitchBackup {
  previous: IdentityKeys;
  /** Unknown (`null`) for a legacy backup, which recorded only the old file. */
  target: IdentityKeys | null;
  previousTokenHash: string;
  targetTokenHash: string;
}

/** Read a journal or legacy backup, or null when it is gone or not one of ours. */
function readBackup(filePath: string, legacy: boolean): SwitchBackup | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    if (legacy) {
      return { previous: pickIdentity(parsed), target: null, previousTokenHash: "", targetTokenHash: "" };
    }
    const journal = parsed as Partial<SwitchJournal>;
    if (journal.claudeManagerSwitch !== 1 || !journal.previous || !journal.target) return null;
    return {
      previous: journal.previous,
      target: journal.target,
      previousTokenHash: journal.previousTokenHash ?? "",
      targetTokenHash: journal.targetTokenHash ?? "",
    };
  } catch {
    return null;
  }
}

function sameAccount(identity: IdentityKeys, profile: SavedProfile | LiveIdentity): boolean {
  const oauth = identity.oauthAccount as Record<string, unknown> | undefined;
  const uuid = typeof oauth?.accountUuid === "string" ? oauth.accountUuid : "";
  const email = typeof oauth?.emailAddress === "string" ? oauth.emailAddress.toLowerCase() : "";
  if (uuid && profile.accountUuid) return uuid === profile.accountUuid;
  return !!email && email === profile.email.toLowerCase();
}

function emailOf(identity: IdentityKeys): string {
  const oauth = identity.oauthAccount as Record<string, unknown> | undefined;
  return typeof oauth?.emailAddress === "string" ? oauth.emailAddress : "";
}

/**
 * Whether the live state is still exactly what a switch leaves when it dies
 * between its two writes: `~/.claude.json` names the target (for a legacy
 * backup, which never recorded one: anyone but the previous account) while
 * the tokens are still the previous account's — its saved slot's, or the
 * very bytes the journal saw being replaced.
 *
 * Anything else means the backup no longer describes reality: the switch
 * completed (the target's tokens are live, perhaps refreshed since), or the
 * user has moved on (a `/login` as a third account). Restoring the previous
 * identity then would pair it with someone else's tokens.
 *
 * `{ unknown }` when `~/.claude.json` cannot be read right now (most often a
 * write in progress), carrying why: the backup is kept and judged again
 * later.
 */
function judgeBackup(backup: SwitchBackup): "interrupted" | "settled" | { unknown: string } {
  const live = readCredentials();
  if (!live) return "settled";
  const liveHash = tokenHash(live.raw);
  const liveSlot = listProfiles().find((p) => p.credentialsHash === liveHash);
  const tokensArePrevious =
    (!!backup.previousTokenHash && liveHash === backup.previousTokenHash) ||
    (!!liveSlot && sameAccount(backup.previous, liveSlot));
  if (!tokensArePrevious) return "settled";
  const config = readLiveConfig();
  if (!config.ok) return { unknown: config.detail };
  if (!config.config) return "settled";
  const liveIdentity = extractIdentity(JSON.stringify(config.config));
  const interrupted = backup.target
    ? sameAccount(backup.target, liveIdentity)
    : !sameAccount(backup.previous, liveIdentity);
  return interrupted ? "interrupted" : "settled";
}

/**
 * Find a switch that died between rewriting `~/.claude.json` and writing
 * the credentials (see `judgeBackup`). Returns null — and so
 * prompts nobody — when:
 *   - the config lock is held, or the journal is under a minute old: another
 *     window may be mid-switch, and its journal is not ours to judge yet;
 *   - a journal no longer describes the live state: it is removed silently;
 *   - a legacy `~/.claude.json.bak` lacks the interrupted-switch signature.
 *     That name is common enough to be a user's or another tool's file, so
 *     it is left untouched.
 * A legacy `.credentials.json.bak` is removed unless it belongs to the
 * legacy switch being reported, which removes it on restore or discard.
 */
export function findInterruptedSwitch(): InterruptedSwitch | null {
  if (isLockHeld(CONFIG_LOCK)) return null;
  let found: InterruptedSwitch | null = null;
  for (const [filePath, legacy] of [
    [SWITCH_JOURNAL, false],
    [LEGACY_SWITCH_BACKUP, true],
  ] as const) {
    let writtenAt: number;
    try {
      writtenAt = fs.statSync(filePath).mtimeMs;
    } catch {
      continue;
    }
    if (Date.now() - writtenAt < INTERRUPTED_SWITCH_MIN_AGE_MS) continue;
    const backup = readBackup(filePath, legacy);
    if (!backup) continue;
    const verdict = judgeBackup(backup);
    if (verdict === "interrupted") {
      found = { path: filePath, legacy, writtenAt, email: emailOf(backup.previous) };
      break;
    }
    if (verdict === "settled" && !legacy) removeQuietly(filePath);
  }
  if (!found?.legacy) removeQuietly(LEGACY_CREDENTIALS_BACKUP);
  return found;
}

/** Remove a reported backup, plus the credentials copy a legacy switch left beside it. */
function removeBackup(pending: InterruptedSwitch): void {
  removeQuietly(pending.path);
  if (pending.legacy) removeQuietly(LEGACY_CREDENTIALS_BACKUP);
}

/**
 * Put back the identity recorded in `pending`, under the same locks a
 * switch takes, and remove the backup. Only the identity keys move; every
 * other key in the live `~/.claude.json` stays as it is now. The state is
 * judged again under the locks, since the prompt may have sat open while
 * another window switched or the user signed in elsewhere; a backup that
 * no longer applies is removed instead (`"no-longer-needed"`).
 */
export function restoreInterruptedSwitch(
  pending: InterruptedSwitch,
): ProfileResult<"restored" | "no-longer-needed"> {
  const locked = withLocks(SWITCH_LOCKS, (): ProfileResult<"restored" | "no-longer-needed"> => {
    // Judging whose tokens are live from a fallback file behind a locked
    // Keychain could restore the wrong identity.
    if (readCredentialsForWrite().state === "keychain-unavailable") {
      return { ok: false, error: "keychain-unavailable", detail: KEYCHAIN_UNAVAILABLE_MESSAGE };
    }
    const backup = readBackup(pending.path, pending.legacy);
    if (!backup) return { ok: true, data: "no-longer-needed" };
    const verdict = judgeBackup(backup);
    if (typeof verdict === "object") {
      return { ok: false, error: "live-unreadable", detail: verdict.unknown };
    }
    if (verdict === "settled") {
      // A legacy file that has lost its signature may be the user's own.
      if (!pending.legacy) removeQuietly(pending.path);
      return { ok: true, data: "no-longer-needed" };
    }
    const restored = restoreIdentity(backup.previous);
    if (!restored.ok) return restored;
    removeBackup(pending);
    return { ok: true, data: "restored" };
  });
  if (!locked.ok) {
    return { ok: false, error: "locked", detail: describeLockFailure(locked.failure) };
  }
  return locked.value;
}

/** Delete the backup `findInterruptedSwitch` reported, and nothing else of the user's. */
export function discardInterruptedSwitch(pending: InterruptedSwitch): void {
  removeBackup(pending);
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
