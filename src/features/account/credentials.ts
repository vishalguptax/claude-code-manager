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
 *   - Source detection cascades file → platform-native (Keychain on
 *     macOS), matching Claude Code's own precedence. File wins when
 *     present so users who manually opt out of Keychain (or who
 *     legitimately have a file from an older CLI) continue to work.
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
import { CLAUDE_DIR } from "../../core/config";

/** Filesystem path Claude CLI writes credentials to (when not using Keychain). */
export const CREDENTIALS_FILE: string = path.join(CLAUDE_DIR, ".credentials.json");

/**
 * macOS Keychain item name Claude Code writes to. Stable in current
 * Claude Code releases; v2.0.14 briefly used `Claude Code` (no suffix)
 * and we probe that as a legacy fallback so users who logged in during
 * that window are not stranded.
 */
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const KEYCHAIN_LEGACY_SERVICE = "Claude Code";

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
 * Detailed state for a single backend read. Distinguishes the three
 * cases callers actually treat differently:
 *   - `ok`        — usable blob present
 *   - `missing`   — backend confirmed nothing is stored here
 *                  (file ENOENT, file with no accessToken, Keychain
 *                  exit 44, etc.) Treat as "user is not signed in".
 *   - `transient` — backend exists but its contents are momentarily
 *                  unusable (mid-write truncation, locked Keychain,
 *                  ACL-denied Keychain, …). Retrying after a brief
 *                  delay is the right move.
 */
type ReadStatus =
  | { state: "ok"; live: LiveCredentials }
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
  if (!looksLikeCredentialsBlob(blob)) {
    // Parses, but no usable accessToken — equivalent to "not signed
    // in" from the caller's perspective. Surfaces the right UI nudge
    // ("log in") instead of "retry later".
    return { state: "missing" };
  }
  return {
    state: "ok",
    live: {
      raw,
      blob,
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
 * Try the current service name, then the v2.0.14 legacy name. Records
 * which service actually matched on the returned source so a later
 * write hits the same slot. The full `ReadStatus` is returned because
 * Keychain errors must map to distinct UI states ("locked" vs
 * "denied" vs "absent"), unlike the file backend where ENOENT is the
 * only failure shape that matters.
 */
function readFromKeychainDarwinStatus(): ReadStatus {
  if (process.platform !== "darwin") return { state: "missing" };
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
    if (!looksLikeCredentialsBlob(blob)) {
      // Item exists but has no usable token — treat as not signed in.
      return { state: "missing" };
    }
    return {
      state: "ok",
      live: {
        raw,
        blob,
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
 * Read live credentials, picking source by precedence (file → macOS
 * Keychain). Returns null when no source yields a valid blob, which
 * callers treat as "not signed in".
 */
export function readCredentials(): LiveCredentials | null {
  const fileRead = readFromFile();
  if (fileRead) return fileRead;
  return readFromKeychainDarwin();
}

/**
 * Read live credentials with three-state status. Lets callers (notably
 * `quota.fetchQuota`) tell apart "not signed in" from "credentials
 * exist but momentarily unreadable" — they map to distinct UI
 * messages.
 *
 * Precedence: file backend first, Keychain only if the file backend
 * reported "missing" (so a file in transient state doesn't get
 * masked by a Keychain success — file is the authoritative store
 * once it exists, matching Claude CLI behaviour).
 */
export function readCredentialsStatus():
  | { state: "ok"; live: LiveCredentials }
  | { state: "missing" }
  | { state: "transient" } {
  const fileStatus = readFromFileStatus();
  if (fileStatus.state === "ok") return fileStatus;
  if (fileStatus.state === "transient") return fileStatus;
  // fileStatus.state === "missing" → consult platform-native store.
  return readFromKeychainDarwinStatus();
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
 * known (e.g. an outside caller restoring a snapshot into a fresh
 * machine). Mirrors Claude CLI's precedence:
 *   - macOS: write to Keychain when the file is absent (default CLI
 *     install on Mac); write to file when the file exists (user has
 *     opted out, or restored a Linux snapshot).
 *   - Other platforms: file.
 */
export function defaultTargetSource(): CredentialsSource {
  if (process.platform === "darwin") {
    try {
      const stat = fs.statSync(CREDENTIALS_FILE);
      if (stat.size > 0) {
        return { kind: "file", locator: CREDENTIALS_FILE };
      }
    } catch {
      /* file absent → keychain target */
    }
    return { kind: "keychain-darwin", locator: KEYCHAIN_SERVICE };
  }
  return { kind: "file", locator: CREDENTIALS_FILE };
}

/**
 * Internal helpers exposed for tests. Real callers should use the
 * public surface — these escape hatches exist so backend probes can
 * be exercised directly without spinning up a real Keychain.
 */
export const __internals = {
  KEYCHAIN_SERVICE,
  KEYCHAIN_LEGACY_SERVICE,
  SECURITY_BIN,
  readFromFile,
  readFromKeychainDarwin,
  runSecurityRead,
  looksLikeCredentialsBlob,
};
