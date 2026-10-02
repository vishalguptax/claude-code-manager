/**
 * Credentials I/O abstraction — the SINGLE entry point for reading,
 * writing, hashing, and locating Claude CLI's OAuth credentials.
 *
 * Background:
 * Claude Code stores credentials in two possible places:
 *   - macOS: encrypted macOS Keychain (default), service name
 *     `Claude Code-credentials`. Falls back to file if file exists.
 *   - Linux / Windows: `~/.claude/.credentials.json` on disk, 0600.
 *
 * Before this module existed, every consumer (parser, quota, profiles,
 * diagnostics) read `.credentials.json` directly with `fs.readFileSync`.
 * On macOS that file is absent for the default install — the CLI's
 * actual tokens live in Keychain — so the extension reported "not
 * signed in" for the majority of macOS users. This is GitHub issue #6.
 *
 * Design:
 *   - Source precedence matches Claude Code's own: on macOS the Keychain
 *     item wins; elsewhere only the file exists. On macOS the file is a
 *     fallback, and the two kinds of caller treat it differently:
 *       - reads for display and identity (`readCredentials`,
 *         `readCredentialsStatus`) fall back to it when the Keychain has
 *         no item or is momentarily unreachable (locked, SSH), as the
 *         CLI's own keychain-then-plaintext read does;
 *       - reads a write depends on (`readCredentialsForWrite`) fall back
 *         only when the Keychain has no item. Behind a locked Keychain the
 *         file may be a stale leftover; persisting it, or writing tokens to
 *         it, would save or install an account the CLI is not using.
 *     Claude Code 2.1.287 made the Keychain win over a leftover
 *     `.credentials.json`; letting the file win here would read a stale
 *     account and send profile swaps to a file the CLI ignores.
 *   - All shell-outs use `execFileSync` with argv arrays — never a
 *     shell string, never user-controlled paths in `cwd` — so there is
 *     no command-injection surface.
 *   - The credentials blob NEVER leaves this module's caller chain
 *     unredacted: consumers read `blob` for the token (only `quota.ts`
 *     needs the access token, and that goes straight into an
 *     `Authorization` header), or `raw` for byte-perfect snapshot
 *     storage. The webview never receives either.
 *   - Race-safe reads use the same pre-hash / read / post-hash retry
 *     pattern that `profiles.ts` used for files, generalised across
 *     both backends so the existing race-safety guarantees survive
 *     for Keychain consumers.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { execFileSync } from "child_process";
import { keychainServiceName } from "../../core/claudeHome";
import { CLAUDE_ENV, SECURE_STORAGE_DIR } from "../../core/config";

/** Filesystem path Claude CLI writes credentials to (when not using Keychain). */
export const CREDENTIALS_FILE: string = path.join(SECURE_STORAGE_DIR, ".credentials.json");

/**
 * macOS Keychain item name Claude Code writes to: `Claude Code-credentials`
 * for the default config dir, with a per-directory hash suffix when
 * `CLAUDE_CONFIG_DIR` moves it — a fixed name would read, and on account
 * switch overwrite, the default directory's login instead. v2.0.14 briefly
 * used `Claude Code` (no `-credentials`) and we probe that as a legacy
 * fallback so users who logged in during that window are not stranded.
 */
export const KEYCHAIN_SERVICE = keychainServiceName(CLAUDE_ENV, "-credentials");
const KEYCHAIN_LEGACY_SERVICE = keychainServiceName(CLAUDE_ENV, "");

/** Absolute path to the macOS `security` CLI. Stable across versions. */
const SECURITY_BIN = "/usr/bin/security";

/** Short cap for any `security` subprocess — Keychain operations are local + sync. */
const SECURITY_TIMEOUT_MS = 5_000;

export type CredentialsSourceKind = "file" | "keychain-darwin";

export interface CredentialsSource {
  kind: CredentialsSourceKind;
  /**
   * For `file` — absolute filesystem path. For `keychain-darwin` —
   * the Keychain service name actually matched (current or legacy).
   */
  locator: string;
}

/**
 * The OAuth subtree Claude CLI writes inside the credentials JSON.
 * Optional throughout because older CLI versions omit fields.
 */
export interface ClaudeOauthBlob {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  subscriptionType?: string;
  rateLimitTier?: string;
  scopes?: string[];
}

/** Full credentials blob shape. Always wraps the oauth fields under `claudeAiOauth`. */
export interface CredentialsBlob {
  claudeAiOauth?: ClaudeOauthBlob;
}

/** Read result. `raw` is the canonical JSON bytes — what we hash + snapshot. */
export interface LiveCredentials {
  raw: string;
  blob: CredentialsBlob;
  source: CredentialsSource;
  hash: string;
}

/**
 * Tagged outcome for keychain probes. Surfaces enough detail for the
 * diagnostics panel to render a precise message — "Keychain locked"
 * looks very different from "Keychain access denied" from the user's
 * perspective and requires a different fix.
 */
export type KeychainStatus =
  | "ok"
  | "absent" // exit 44 — no matching item in Keychain
  | "denied" // exit 51 — ACL refused (user clicked Deny, or app not in ACL)
  | "locked" // exit 25 — default Keychain locked
  | "unreachable" // exit 36 — interaction not allowed (SSH, headless)
  | "unsupported" // not on macOS
  | "error"; // unexpected exit code or spawn failure

/** SHA-256 hex of a credentials raw blob. Stable across sources. */
export function hashCredentials(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Validate that a parsed blob has the minimum shape Claude CLI writes.
 * We accept "anything with a claudeAiOauth object containing at least
 * an accessToken string" — that's the smallest contract every consumer
 * relies on. Tighter validation here would reject perfectly valid
 * legacy payloads.
 */
function looksLikeCredentialsBlob(value: unknown): value is CredentialsBlob {
  if (!value || typeof value !== "object") return false;
  const oauth = (value as { claudeAiOauth?: unknown }).claudeAiOauth;
  if (!oauth || typeof oauth !== "object") return false;
  const tok = (oauth as { accessToken?: unknown }).accessToken;
  return typeof tok === "string" && tok.length > 0;
}

/**
 * Detailed state for a single backend read. Distinguishes the
 * cases callers actually treat differently:
 *   - `ok`        — usable blob present
 *   - `no-account-token` — a blob is stored but holds no account
 *                  `accessToken` (signed out, or only `mcpOAuth` left).
 *                  "Not signed in" for display, but the store is still
 *                  the live one: a write must target it and merge into
 *                  `live.raw`, or the MCP connector tokens are lost.
 *   - `missing`   — backend confirmed nothing is stored here
 *                  (file ENOENT, Keychain exit 44, etc.)
 *   - `transient` — backend exists but its contents are momentarily
 *                  unusable (mid-write truncation, locked Keychain,
 *                  ACL-denied Keychain, …). Retrying after a brief
 *                  delay is the right move.
 */
type ReadStatus =
  | { state: "ok"; live: LiveCredentials }
  | { state: "no-account-token"; live: LiveCredentials }
  | { state: "missing" }
  | { state: "transient" };

/**
 * Read the credentials file with full state detail. See `ReadStatus`.
 */
function readFromFileStatus(): ReadStatus {
  let raw: string;
  try {
    raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { state: "missing" };
    }
    // Permission denied or other transient I/O — caller decides
    // whether to retry or surface.
    return { state: "transient" };
  }
  if (!raw.trim()) return { state: "transient" };
  let blob: unknown;
  try {
    blob = JSON.parse(raw);
  } catch {
    // Mid-write truncation typically lands here.
    return { state: "transient" };
  }
  return {
    // Parses, but no usable accessToken: "not signed in", which surfaces
    // the right UI nudge ("log in") instead of "retry later".
    state: looksLikeCredentialsBlob(blob) ? "ok" : "no-account-token",
    live: {
      raw,
      blob: blob as CredentialsBlob,
      source: { kind: "file", locator: CREDENTIALS_FILE },
      hash: hashCredentials(raw),
    },
  };
}

/**
 * Convenience wrapper that drops the status and returns just the live
 * struct (or null). Existing callers that don't need to distinguish
 * "missing" from "transient" stay on this thinner surface.
 */
function readFromFile(): LiveCredentials | null {
  const r = readFromFileStatus();
  return r.state === "ok" ? r.live : null;
}

/**
 * Invoke `security find-generic-password -s <svc> -w` and return its
 * stdout, exit code, and stderr. Returns a tagged result so callers
 * can distinguish "no item" (exit 44 — normal "not signed in") from
 * "Keychain locked / ACL denied / SSH" (actionable errors).
 *
 * Uses `execFileSync` with an argv array — no shell, no interpolation.
 */
function runSecurityRead(service: string): {
  status: KeychainStatus;
  stdout: string;
} {
  try {
    const stdout = execFileSync(
      SECURITY_BIN,
      ["find-generic-password", "-s", service, "-w"],
      {
        encoding: "utf-8",
        timeout: SECURITY_TIMEOUT_MS,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    return { status: "ok", stdout: stdout.replace(/\n$/, "") };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: number };
    const code = typeof e.status === "number" ? e.status : -1;
    switch (code) {
      case 44:
        return { status: "absent", stdout: "" };
      case 51:
        return { status: "denied", stdout: "" };
      case 25:
        return { status: "locked", stdout: "" };
      case 36:
        return { status: "unreachable", stdout: "" };
      default:
        return { status: "error", stdout: "" };
    }
  }
}

/**
 * Short-lived cache for the Keychain read. Unlike the file backend
 * (where mtime is a free change signal), detecting a Keychain change
 * costs a full `security` spawn — the thing being avoided. A few
 * seconds of staleness is invisible to the UI (account parses fire on
 * watcher debounces anyway), while an active session's parse bursts
 * would otherwise spawn `security` several times per second and each
 * spawn blocks the extension host — with a locked Keychain, for up to
 * SECURITY_TIMEOUT_MS. Writes and deletes invalidate immediately.
 */
const KEYCHAIN_CACHE_TTL_MS = 3_000;
let keychainCache: { status: ReadStatus; readAt: number } | null = null;

function invalidateKeychainCache(): void {
  keychainCache = null;
}

/**
 * Try the current service name, then the v2.0.14 legacy name. Records
 * which service actually matched on the returned source so a later
 * write hits the same slot. The full `ReadStatus` is returned because
 * Keychain errors must map to distinct UI states ("locked" vs
 * "denied" vs "absent"), unlike the file backend where ENOENT is the
 * only failure shape that matters.
 */
function readFromKeychainDarwinStatus(): ReadStatus {
  if (process.platform !== "darwin") return { state: "missing" };
  if (keychainCache && Date.now() - keychainCache.readAt < KEYCHAIN_CACHE_TTL_MS) {
    return keychainCache.status;
  }
  const status = readFromKeychainDarwinStatusUncached();
  keychainCache = { status, readAt: Date.now() };
  if (status.state === "ok") noteKeychainHash(status.live.hash);
  return status;
}

/**
 * When this process first saw the current Keychain item. A Keychain item has
 * no mtime we can read without another `security` spawn, so the moment we
 * observe a new hash stands in for it. That is never earlier than the real
 * change, which errs on the side of "changed recently" — the safe direction
 * for `credentialsChangedAt`'s callers.
 *
 * The very first sighting is stamped 0 ("long settled"): its real age is
 * unknown, and treating every startup as a fresh credentials change would
 * hold off profile sync and switching for no reason on every window open.
 */
let keychainSeen: { hash: string; at: number } | null = null;

function noteKeychainHash(hash: string): void {
  if (!keychainSeen) keychainSeen = { hash, at: 0 };
  else if (keychainSeen.hash !== hash) keychainSeen = { hash, at: Date.now() };
}

function readFromKeychainDarwinStatusUncached(): ReadStatus {
  let sawTransient = false;
  for (const service of [KEYCHAIN_SERVICE, KEYCHAIN_LEGACY_SERVICE]) {
    const r = runSecurityRead(service);
    if (r.status === "absent") continue;
    if (r.status !== "ok") {
      // Locked / denied / unreachable / error — we don't know whether
      // the user is signed in or not. Surface as transient so the
      // diagnostics check can render the precise reason; quota/etc
      // will retry.
      sawTransient = true;
      continue;
    }
    const raw = r.stdout;
    if (!raw.trim()) {
      sawTransient = true;
      continue;
    }
    let blob: unknown;
    try {
      blob = JSON.parse(raw);
    } catch {
      sawTransient = true;
      continue;
    }
    return {
      // An item without a usable token is "not signed in" for display,
      // but it is still the store the CLI reads (see `ReadStatus`).
      state: looksLikeCredentialsBlob(blob) ? "ok" : "no-account-token",
      live: {
        raw,
        blob: blob as CredentialsBlob,
        source: { kind: "keychain-darwin", locator: service },
        hash: hashCredentials(raw),
      },
    };
  }
  return sawTransient ? { state: "transient" } : { state: "missing" };
}

function readFromKeychainDarwin(): LiveCredentials | null {
  const r = readFromKeychainDarwinStatus();
  return r.state === "ok" ? r.live : null;
}

/**
 * Distinguish "user has never signed in (no credentials anywhere)"
 * from "credentials exist but a read landed mid-rewrite". Callers
 * that want to surface "you're not logged in" vs "try again in a
 * moment" use this to decide which message to show.
 *
 * Returns true only when EVERY known source is confirmed absent. On
 * macOS that means both the file is ENOENT and the Keychain probe
 * reports the item is missing (exit 44). A locked or denied Keychain
 * is NOT treated as absent — the user might be signed in but the
 * extension just can't see the item yet.
 */
export function isLoggedOut(): boolean {
  try {
    const stat = fs.statSync(CREDENTIALS_FILE);
    if (stat.size > 0) return false;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") return false;
  }
  if (process.platform === "darwin") {
    const status = probeKeychainStatus();
    if (status !== "absent" && status !== "unsupported") return false;
  }
  return true;
}

/**
 * Probe the Keychain without parsing. Used by the diagnostics check
 * so we can surface specific error states without forcing a full read
 * each time. Returns the FIRST distinguishable status across the two
 * service names — "absent" only when both names report absent.
 */
export function probeKeychainStatus(): KeychainStatus {
  if (process.platform !== "darwin") return "unsupported";
  let sawAbsent = false;
  for (const service of [KEYCHAIN_SERVICE, KEYCHAIN_LEGACY_SERVICE]) {
    const r = runSecurityRead(service);
    if (r.status === "ok") return "ok";
    if (r.status === "absent") {
      sawAbsent = true;
      continue;
    }
    // Locked / denied / unreachable / error — surface immediately;
    // the second probe will hit the same wall and waste time.
    return r.status;
  }
  return sawAbsent ? "absent" : "error";
}

/**
 * Read live credentials, picking source by precedence (macOS Keychain →
 * file; see the module header). Returns null when no source yields a
 * valid blob, which callers treat as "not signed in".
 */
export function readCredentials(): LiveCredentials | null {
  const status = readCredentialsStatus();
  return status.state === "ok" ? status.live : null;
}

/**
 * Read live credentials with three-state status. Lets callers (notably
 * `quota.fetchQuota`) tell apart "not signed in" from "credentials
 * exist but momentarily unreadable" — they map to distinct UI
 * messages.
 *
 * For display and identity (see the module header): a usable Keychain
 * item wins; otherwise the file decides, except that a file that is
 * merely absent does not hide a Keychain that is momentarily unreadable —
 * that is "try again", not "not signed in".
 */
export function readCredentialsStatus():
  | { state: "ok"; live: LiveCredentials }
  | { state: "missing" }
  | { state: "transient" } {
  const keychainStatus = readFromKeychainDarwinStatus();
  if (keychainStatus.state === "ok") return keychainStatus;
  // An item without an account token is what the CLI reads: signed out,
  // with no fallback to a leftover file.
  if (keychainStatus.state === "no-account-token") return { state: "missing" };
  const fileStatus = readFromFileStatus();
  if (fileStatus.state === "no-account-token") return { state: "missing" };
  return fileStatus.state === "missing" ? keychainStatus : fileStatus;
}

/**
 * Race-safe variant: catches the window where Claude CLI is mid-write
 * (file truncated, Keychain item being replaced). Hashes the value,
 * re-reads, retries once if the hash moved. Without this, snapshot
 * captures would occasionally land mid-rotation and produce a snapshot
 * that doesn't match either the pre- or post-rotation state.
 */
export function readCredentialsRaceSafe(): LiveCredentials | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    const first = readCredentials();
    if (!first) return null;
    const second = readCredentials();
    if (!second) return null;
    if (first.hash === second.hash) return second;
  }
  return null;
}

/**
 * When `live` last changed, in ms epoch: the file's mtime, or for the
 * Keychain the moment this process first observed the item's current bytes
 * (see `keychainSeen`). Lets callers order a credentials change against a
 * `~/.claude.json` write — `/login` writes the tokens first and the account
 * identity second, so tokens newer than the identity may belong to someone
 * else. When the time cannot be read, returns now: "just changed" makes the
 * caller wait rather than trust a pairing it cannot verify.
 */
export function credentialsChangedAt(live: LiveCredentials): number {
  if (live.source.kind === "file") {
    try {
      return fs.statSync(live.source.locator).mtimeMs;
    } catch {
      return Date.now();
    }
  }
  return keychainSeen && keychainSeen.hash === live.hash ? keychainSeen.at : Date.now();
}

/** Shown when a write is refused because the Keychain cannot be read. */
export const KEYCHAIN_UNAVAILABLE_MESSAGE =
  "The macOS Keychain is locked or unavailable — unlock it and try again";

/**
 * Credentials for a caller about to write: a profile switch, a restore, or
 * a slot snapshot. Reads past the Keychain cache, whose value can predate a
 * refresh by up to KEYCHAIN_CACHE_TTL_MS, and reports a momentarily
 * unreadable Keychain as `keychain-unavailable` instead of falling back to
 * the file (see the module header). Callers refuse on that state. Unlike
 * the display reads it also reports `no-account-token`, so a write lands
 * in the store that holds the blob and merges into it.
 */
export function readCredentialsForWrite(): ReadStatus | { state: "keychain-unavailable" } {
  invalidateKeychainCache();
  const keychainStatus = readFromKeychainDarwinStatus();
  if (keychainStatus.state === "transient") return { state: "keychain-unavailable" };
  if (keychainStatus.state !== "missing") return keychainStatus;
  return readFromFileStatus();
}

/** Detected source for the currently-signed-in account, or null. */
export function detectSource(): CredentialsSource | null {
  const live = readCredentials();
  return live ? live.source : null;
}

/**
 * Write credentials to the given source. The raw bytes are written
 * verbatim — no re-serialisation — so byte-hash comparisons stay
 * stable across read / write round-trips.
 *
 * File backend: tmp-write + rename for atomicity; chmod 600 on POSIX.
 * Keychain backend: `security add-generic-password -U` upserts in one
 * step; the kernel takes care of atomicity.
 *
 * Returns false on any failure. Callers must NOT log raw payloads on
 * failure (they contain tokens); surface a generic "couldn't write
 * credentials" message instead.
 */
export function writeCredentials(raw: string, source: CredentialsSource): boolean {
  if (source.kind === "file") {
    return writeToFile(raw);
  }
  if (source.kind === "keychain-darwin") {
    return writeToKeychainDarwin(raw, source.locator);
  }
  return false;
}

function writeToFile(raw: string): boolean {
  const tmp = CREDENTIALS_FILE + ".tmp";
  try {
    fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true });
    fs.writeFileSync(tmp, raw);
    try {
      fs.chmodSync(tmp, 0o600);
    } catch {
      // chmod fails on Windows — the directory ACL already restricts
      // access to the user profile, which is what Claude CLI relies on
      // too. Not fatal.
    }
    fs.renameSync(tmp, CREDENTIALS_FILE);
    return true;
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Write to macOS Keychain. The account argument (`-a`) is required by
 * `security add-generic-password`; we pass the current OS username so
 * the item appears under the user who is signed in. The token-bearing
 * raw blob is passed via argv (`-w`) — `security` does not accept the
 * password on stdin. The process lifetime is sub-100ms; this matches
 * Claude CLI's own approach.
 */
function writeToKeychainDarwin(raw: string, service: string): boolean {
  if (process.platform !== "darwin") return false;
  const account = currentUsername();
  if (!account) return false;
  invalidateKeychainCache();
  try {
    execFileSync(
      SECURITY_BIN,
      [
        "add-generic-password",
        "-U", // update if exists
        "-s",
        service,
        "-a",
        account,
        "-w",
        raw,
      ],
      {
        timeout: SECURITY_TIMEOUT_MS,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the current OS username. `os.userInfo()` is the reliable
 * primary; environment-variable fallbacks cover sandboxed contexts
 * where `userInfo` throws (rare on macOS but cheap to guard against).
 */
function currentUsername(): string {
  try {
    const u = os.userInfo().username;
    if (u && u.trim()) return u.trim();
  } catch {
    /* fall through */
  }
  const env =
    process.env.USER || process.env.LOGNAME || process.env.USERNAME || "";
  return env.trim();
}

/**
 * Remove the credentials item from the given source. Used only by
 * recovery flows when a partial swap has left an unusable state —
 * the normal switch path overwrites, it doesn't delete first.
 *
 * Returns true when the item is gone after the call (including the
 * case where it never existed). Returns false on unexpected errors.
 */
export function deleteCredentials(source: CredentialsSource): boolean {
  if (source.kind === "file") {
    try {
      fs.rmSync(CREDENTIALS_FILE, { force: true });
      return true;
    } catch {
      return false;
    }
  }
  if (source.kind === "keychain-darwin") {
    if (process.platform !== "darwin") return false;
    invalidateKeychainCache();
    try {
      execFileSync(
        SECURITY_BIN,
        ["delete-generic-password", "-s", source.locator],
        {
          timeout: SECURITY_TIMEOUT_MS,
          stdio: ["ignore", "ignore", "pipe"],
          windowsHide: true,
        },
      );
      return true;
    } catch (err) {
      const code = (err as { status?: number }).status;
      // 44 = item already absent. That's the end state we want.
      return code === 44;
    }
  }
  return false;
}

/**
 * Decide which source a write should target when no explicit source is
 * known (e.g. restoring a snapshot while signed out). Mirrors Claude
 * CLI's precedence: the Keychain on macOS — a file written there would
 * be shadowed by any Keychain item the CLI finds first — and the file
 * everywhere else.
 */
export function defaultTargetSource(): CredentialsSource {
  if (process.platform === "darwin") {
    return { kind: "keychain-darwin", locator: KEYCHAIN_SERVICE };
  }
  return { kind: "file", locator: CREDENTIALS_FILE };
}
