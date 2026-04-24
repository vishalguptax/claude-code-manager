/**
 * Account profiles — snapshot and swap Claude CLI credentials so users
 * can move between multiple accounts without going through the full
 * `/logout` + `/login` browser dance each time.
 *
 * Storage layout:
 *   ~/.claude/manager-accounts/<slug>/
 *     .claude.json            — oauthAccount + userID captured at save time
 *     .credentials.json       — OAuth access/refresh tokens, expiry
 *     profile.json            — label, savedAt, userID, email (our metadata)
 *
 * Switching merges identity into live state: `oauthAccount` + `userID`
 * are overwritten from the snapshot; every other key in `~/.claude.json`
 * (projects, numStartups, migration flags, caches, onboarding, MCP
 * config, …) is preserved as-is. `~/.claude/.credentials.json` is
 * swapped wholesale because it holds only OAuth tokens.
 *
 * Active-profile detection falls through three matchers in this order:
 *   1. byte-identical credentials hash (same token = same snapshot)
 *   2. live `userID` equals a saved userID (token rotated, same acct)
 *   3. live email equals a saved email (pre-userID snapshots)
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

const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");
const CREDENTIALS_FILE = path.join(CLAUDE_DIR, ".credentials.json");
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
   * Stable across token rotations, unlike the credentials hash; used
   * as the fallback identity matcher in `getActiveProfileSlug` and as
   * the dedupe key in `saveProfile`.
   */
  userID: string;
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
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return "";
  }
}

/**
 * Read the two live identity files in a race-safe way: hash first,
 * read both, hash again. If the creds file mutated between hashes
 * (Claude CLI mid-refresh), retry once. Returns null on unrecoverable
 * error — callers treat that as "no active account".
 *
 * Without this, `saveProfile` could capture claude.json with one
 * token generation and credentials.json with another, producing a
 * snapshot that never matches either identity cleanly.
 */
function readLivePairRaceSafe(): {
  claudeJsonRaw: string;
  credsRaw: string;
} | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    const preHash = hashFile(CREDENTIALS_FILE);
    if (!preHash) return null;
    let claudeJsonRaw: string;
    let credsRaw: string;
    try {
      claudeJsonRaw = fs.readFileSync(CLAUDE_JSON, "utf-8");
      credsRaw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    } catch {
      return null;
    }
    if (!claudeJsonRaw.trim() || !credsRaw.trim()) return null;
    const postHash = hashFile(CREDENTIALS_FILE);
    if (postHash === preHash) {
      return { claudeJsonRaw, credsRaw };
    }
    // Token rotated mid-read; retry once.
  }
  return null;
}

/** Parse oauthAccount.emailAddress + userID from claude.json content. */
function extractIdentity(claudeJsonRaw: string): { email: string; userID: string } {
  try {
    const parsed = JSON.parse(claudeJsonRaw) as Record<string, unknown>;
    const oauth = parsed.oauthAccount as Record<string, unknown> | undefined;
    const email = typeof oauth?.emailAddress === "string" ? oauth.emailAddress : "";
    const userID = typeof parsed.userID === "string" ? parsed.userID : "";
    return { email, userID };
  } catch {
    return { email: "", userID: "" };
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
function extractIdentityFromToken(credsRaw: string): { email: string; userID: string } | null {
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
    // in some payloads; `email` / `email_address` for the email claim.
    const userID =
      (typeof claims.sub === "string" && claims.sub) ||
      (typeof claims.account_uuid === "string" && claims.account_uuid) ||
      (typeof claims.user_id === "string" && claims.user_id) ||
      "";
    const email =
      (typeof claims.email === "string" && claims.email) ||
      (typeof claims.email_address === "string" && claims.email_address) ||
      "";
    if (!userID && !email) return null;
    return { email, userID };
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
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/**
 * Return the slug of the profile that matches the live credentials, or
 * null when none do. Match cascade:
 *   1. credentials hash (byte-identical = same snapshot)
 *   2. userID (Anthropic-stable id; survives token rotation)
 *   3. email (fallback for older snapshots saved before userID storage)
 *
 * Without the cascade, Claude CLI's background token refresh would
 * silently "unsave" the active profile because the hash diverges even
 * though the account is unchanged.
 */
export function getActiveProfileSlug(): string | null {
  const liveHash = hashFile(CREDENTIALS_FILE);
  if (!liveHash) return null;

  const profiles = listProfiles();

  // Pass 1: exact hash match.
  for (const p of profiles) {
    if (p.credentialsHash === liveHash) return p.slug;
  }

  // Pass 2 + 3 need live identity. ONLY source: the JWT access-token
  // claims. Reading identity from `.claude.json` is a trap because
  // Claude CLI rewrites `.credentials.json` BEFORE `.claude.json`
  // during /login — so during that window `.claude.json` still
  // describes the PREVIOUS account while `.credentials.json` holds
  // the new tokens. Trusting the JWT sidesteps the file-write race
  // entirely. If the token yields no claims we recognise, we return
  // null and let the UI show the "Save profile" button; saveProfile's
  // dedupe will catch the case where a matching slot already exists
  // (it keys off the same JWT).
  let liveIdentity: { email: string; userID: string } | null = null;
  try {
    const credsRaw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    liveIdentity = extractIdentityFromToken(credsRaw);
  } catch {
    // Credentials missing / unreadable — no active account to match.
  }
  if (!liveIdentity) return null;

  // Tie-break by freshest savedAt when more than one profile matches
  // the same identity. Without this, duplicate slots (created before
  // the dedupe fix landed, or by a user who intentionally double-
  // saved) would always resolve to the alphabetically-first slug —
  // which is rarely what the user means when they look at the
  // switcher. Newest wins: most-recent activity is the best proxy
  // for "which slot is this user mentally tracking".
  const freshestFirst = (a: SavedProfile, b: SavedProfile): number => {
    const at = Date.parse(a.savedAt || "") || 0;
    const bt = Date.parse(b.savedAt || "") || 0;
    return bt - at;
  };

  // Stage 2: userID match — but only when the saved slot's captured
  // email ALSO matches (or is empty). Requiring both fields agrees
  // protects against pre-fix snapshots that captured a stale userID
  // from `.claude.json` mid-write; those snapshots have the right
  // email but the wrong userID, and a userID-only match would point
  // them at the wrong account.
  if (liveIdentity.userID) {
    const emailLower = liveIdentity.email.toLowerCase();
    const candidates = profiles
      .filter((p) => {
        if (!p.userID || p.userID !== liveIdentity.userID) return false;
        if (!p.email || !emailLower) return true; // no email to cross-check
        return p.email.toLowerCase() === emailLower;
      })
      .sort(freshestFirst);
    if (candidates[0]) return candidates[0].slug;
  }

  // Stage 3: email-only match (snapshots saved before userID storage
  // existed, or saved snapshots whose userID got corrupted by the
  // pre-fix race). Safe to match on email alone here because stage 2
  // already absorbed the userID-matching cases.
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

  // Dedupe key: prefer JWT identity (authoritative for the current
  // token). Fall back to .claude.json identity only when the token
  // isn't decodable — in that case .claude.json's staleness risks a
  // false-positive dedupe, but minting a duplicate is preferable to
  // silently refusing a legitimate save on fresh login.
  const tokenIdentity = extractIdentityFromToken(credsRaw);
  const jsonIdentity = extractIdentity(claudeJsonRaw);
  const identity = tokenIdentity ?? jsonIdentity;

  if (tokenIdentity && (tokenIdentity.userID || tokenIdentity.email)) {
    const existing = listProfiles().find((p) => {
      if (tokenIdentity.userID && p.userID) return p.userID === tokenIdentity.userID;
      if (tokenIdentity.email && p.email) {
        return p.email.toLowerCase() === tokenIdentity.email.toLowerCase();
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
  const identity = extractIdentity(claudeJsonRaw);

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
    },
  };
}

/**
 * Activate the named profile. Identity keys (`oauthAccount`, `userID`)
 * are merged into the live `.claude.json`; every other key (projects,
 * numStartups, migration flags, caches, onboarding state, MCP config,
 * …) is preserved so switching doesn't roll back weeks of accumulated
 * state. `.credentials.json` is swapped wholesale because it's an
 * identity-only file.
 *
 * Two-file writes are made crash-safe: the live files are backed up
 * before either rename. If the second rename fails mid-way the backups
 * are restored so we never leave a split state (identity from one
 * account, tokens from another).
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

  // Two-file atomic-ish swap with rollback. Write both tmps first so
  // disk-full aborts before any live file is touched. Back up live
  // files, then rename in sequence; if either rename throws, restore
  // from the backup so we never leave the pair out of sync.
  const claudeJsonTmp = CLAUDE_JSON + ".tmp";
  const credsTmp = CREDENTIALS_FILE + ".tmp";
  const claudeJsonBak = CLAUDE_JSON + ".bak";
  const credsBak = CREDENTIALS_FILE + ".bak";

  // Clean up any prior stragglers so writes below don't race with them.
  for (const p of [claudeJsonTmp, credsTmp, claudeJsonBak, credsBak]) {
    try { fs.rmSync(p, { force: true }); } catch { /* ignore */ }
  }

  try {
    fs.writeFileSync(claudeJsonTmp, mergedClaudeJson);
    fs.writeFileSync(credsTmp, credsRaw);

    // Back up live files before renaming. Use copyFile so we can
    // restore even if the rename partially succeeded.
    const claudeJsonExists = fs.existsSync(CLAUDE_JSON);
    const credsExists = fs.existsSync(CREDENTIALS_FILE);
    if (claudeJsonExists) fs.copyFileSync(CLAUDE_JSON, claudeJsonBak);
    if (credsExists) fs.copyFileSync(CREDENTIALS_FILE, credsBak);

    try {
      fs.renameSync(claudeJsonTmp, CLAUDE_JSON);
    } catch (err) {
      // First rename failed — nothing to roll back, just clean up.
      try { fs.rmSync(claudeJsonTmp, { force: true }); } catch { /* ignore */ }
      try { fs.rmSync(credsTmp, { force: true }); } catch { /* ignore */ }
      try { fs.rmSync(claudeJsonBak, { force: true }); } catch { /* ignore */ }
      try { fs.rmSync(credsBak, { force: true }); } catch { /* ignore */ }
      throw err;
    }

    try {
      fs.renameSync(credsTmp, CREDENTIALS_FILE);
    } catch (err) {
      // Second rename failed — restore .claude.json from backup so
      // identity + tokens don't end up out of sync.
      if (claudeJsonExists) {
        try { fs.copyFileSync(claudeJsonBak, CLAUDE_JSON); } catch { /* best-effort */ }
      }
      try { fs.rmSync(credsTmp, { force: true }); } catch { /* ignore */ }
      try { fs.rmSync(claudeJsonBak, { force: true }); } catch { /* ignore */ }
      try { fs.rmSync(credsBak, { force: true }); } catch { /* ignore */ }
      throw err;
    }

    // Success — drop backups.
    try { fs.rmSync(claudeJsonBak, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(credsBak, { force: true }); } catch { /* ignore */ }
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
      email: meta.email ?? "",
      organizationName: meta.organizationName ?? "",
      subscriptionType: meta.subscriptionType ?? "",
      savedAt: meta.savedAt ?? "",
      tokenExpiresAt: meta.tokenExpiresAt ?? 0,
      credentialsHash: hashFile(CREDENTIALS_FILE),
      userID: meta.userID ?? "",
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
