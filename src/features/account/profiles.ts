/**
 * Account profiles — snapshot and swap Claude CLI credentials so users
 * can move between multiple accounts without going through the full
 * `/logout` + `/login` browser dance each time.
 *
 * Storage layout:
 *   ~/.claude/manager-accounts/<slug>/
 *     .claude.json            — profile, org, email, user id
 *     .credentials.json       — OAuth access/refresh tokens, expiry
 *     profile.json            — our metadata (label, email, savedAt)
 *
 * Switching = overwrite the home-dir files (`~/.claude.json` +
 * `~/.claude/.credentials.json`) from a slot. Claude CLI on next launch
 * picks up the new identity transparently.
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
   * SHA-256 of the snapshot's credentials file. Used to detect which
   * profile matches the live `~/.claude/.credentials.json` without
   * loading the token into memory anywhere outside the parser module.
   */
  credentialsHash: string;
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
  } catch {
    // Missing/corrupt metadata — we'll re-derive from the snapshot files.
  }

  try {
    const raw = fs.readFileSync(path.join(slotDir, ".claude.json"), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const oauth = parsed.oauthAccount as Record<string, unknown> | undefined;
    if (oauth) {
      if (typeof oauth.emailAddress === "string") out.email = oauth.emailAddress;
      if (typeof oauth.organizationName === "string") {
        out.organizationName = oauth.organizationName;
      }
    }
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
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/**
 * Return the slug of the profile that matches the live credentials, or
 * null when none do. Compared via SHA-256 so a stale-token refresh
 * elsewhere doesn't produce a false match.
 */
export function getActiveProfileSlug(): string | null {
  const liveHash = hashFile(CREDENTIALS_FILE);
  if (!liveHash) return null;
  for (const p of listProfiles()) {
    if (p.credentialsHash === liveHash) return p.slug;
  }
  return null;
}

/** Error codes returned from write operations. Keeps UI text stable. */
export type ProfileError =
  | "no-active-account"
  | "slug-exists"
  | "slot-missing"
  | "copy-failed"
  | "unreadable-source";

export type ProfileResult<T> = { ok: true; data: T } | { ok: false; error: ProfileError; detail?: string };

/**
 * Snapshot the current `~/.claude.json` + `~/.claude/.credentials.json`
 * into a new slot. Fails when no active account exists (either file
 * missing / empty) or when the slug collides with an existing slot.
 */
export function saveProfile(label: string): ProfileResult<SavedProfile> {
  const trimmed = label.trim();
  if (!trimmed) {
    return { ok: false, error: "copy-failed", detail: "Label is empty" };
  }

  // Verify there's actually an active account to snapshot.
  let claudeJsonRaw: string;
  let credsRaw: string;
  try {
    claudeJsonRaw = fs.readFileSync(CLAUDE_JSON, "utf-8");
    credsRaw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
  } catch {
    return { ok: false, error: "no-active-account" };
  }
  if (!claudeJsonRaw.trim() || !credsRaw.trim()) {
    return { ok: false, error: "no-active-account" };
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
        { label: trimmed, savedAt: new Date().toISOString() },
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
      email: meta.email ?? "",
      organizationName: meta.organizationName ?? "",
      subscriptionType: meta.subscriptionType ?? "",
      savedAt: meta.savedAt ?? new Date().toISOString(),
      tokenExpiresAt: meta.tokenExpiresAt ?? 0,
      credentialsHash: hashFile(path.join(slotDir, ".credentials.json")),
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

  let claudeJsonRaw: string;
  let credsRaw: string;
  try {
    claudeJsonRaw = fs.readFileSync(CLAUDE_JSON, "utf-8");
    credsRaw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
  } catch {
    return { ok: false, error: "no-active-account" };
  }
  if (!claudeJsonRaw.trim() || !credsRaw.trim()) {
    return { ok: false, error: "no-active-account" };
  }

  try {
    fs.writeFileSync(path.join(slotDir, ".claude.json"), claudeJsonRaw);
    fs.writeFileSync(path.join(slotDir, ".credentials.json"), credsRaw);
    // Bump savedAt in profile.json; preserve label.
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
        { label, savedAt: new Date().toISOString() },
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
      email: meta.email ?? "",
      organizationName: meta.organizationName ?? "",
      subscriptionType: meta.subscriptionType ?? "",
      savedAt: meta.savedAt ?? new Date().toISOString(),
      tokenExpiresAt: meta.tokenExpiresAt ?? 0,
      credentialsHash: hashFile(path.join(slotDir, ".credentials.json")),
    },
  };
}

/**
 * Activate the named profile by overwriting the live home-dir files.
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

  try {
    // Read first, validate JSON parses, then write atomically-ish
    // (write temp + rename) so a partial write can't brick the user's
    // ~/.claude.json.
    const claudeJsonRaw = fs.readFileSync(slotClaudeJson, "utf-8");
    const credsRaw = fs.readFileSync(slotCreds, "utf-8");
    JSON.parse(claudeJsonRaw);
    JSON.parse(credsRaw);

    const claudeJsonTmp = CLAUDE_JSON + ".tmp";
    const credsTmp = CREDENTIALS_FILE + ".tmp";
    fs.writeFileSync(claudeJsonTmp, claudeJsonRaw);
    fs.writeFileSync(credsTmp, credsRaw);
    fs.renameSync(claudeJsonTmp, CLAUDE_JSON);
    fs.renameSync(credsTmp, CREDENTIALS_FILE);
  } catch (err) {
    return {
      ok: false,
      error: "unreadable-source",
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
