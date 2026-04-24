/**
 * OAuth quota fetcher — the ONLY network call Claude Manager makes.
 *
 * Privacy: we contact `api.anthropic.com` exclusively, using the user's
 * own OAuth access token from `~/.claude/.credentials.json`. The
 * response contains *their own* subscription utilization, so nothing
 * leaves the machine that wasn't already tied to their account. The
 * token itself is never forwarded to the webview.
 *
 * This is an opt-in fetch — triggered only when the user clicks
 * "Refresh" on the Quota card. No auto-polling, no background ping.
 * Keeps the extension's "100% local by default" promise intact while
 * providing the one piece of data users can't derive from local files
 * (quota utilization is server-computed, cross-platform).
 *
 * Based on [anthropics/claude-code#13585 community findings]:
 *   GET https://api.anthropic.com/api/oauth/usage
 *   Authorization: Bearer <accessToken>
 *   anthropic-beta: oauth-2025-04-20
 *
 * The `anthropic-beta` header is required; requests without it get a
 * 401 `authentication_error`. Field shape is community-documented and
 * stable across recent Claude releases.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";

const CREDENTIALS_FILE = path.join(os.homedir(), ".claude", ".credentials.json");
const USAGE_HOST = "api.anthropic.com";
const USAGE_PATH = "/api/oauth/usage";
const BETA_HEADER = "oauth-2025-04-20";
const NETWORK_TIMEOUT_MS = 10_000;

/** A single quota window as displayed to the user. */
export interface QuotaWindow {
  /** Percentage 0–100 of the window's cap consumed. */
  utilization: number;
  /** ISO timestamp when the window resets, or "" when unknown. */
  resetsAt: string;
}

/** Full quota snapshot returned to the webview. */
export interface QuotaData {
  /** Rolling 5-hour window — the rate-limit that bites first. */
  fiveHour: QuotaWindow;
  /** Rolling 7-day window — the weekly overall cap. */
  sevenDay: QuotaWindow;
  /** Per-model 7-day windows. Null fields from the API are omitted. */
  sevenDaySonnet: QuotaWindow | null;
  sevenDayOpus: QuotaWindow | null;
  /** Pay-as-you-go overflow. Only present when the user has it enabled. */
  extraUsage: {
    enabled: boolean;
    monthlyLimit: number | null;
    usedCredits: number | null;
    utilization: number | null;
    currency: string | null;
  } | null;
  /** ISO timestamp for when we fetched this data (local). */
  fetchedAt: string;
}

/** Error shape surfaced to the webview so the UI can render a helpful message. */
export interface QuotaError {
  /** Machine-friendly category — lets the UI pick an icon + action. */
  kind: "no-credentials" | "unauthorized" | "network" | "parse" | "unknown";
  /** Short human sentence. Safe to render verbatim. */
  message: string;
}

export type QuotaResult = { ok: true; data: QuotaData } | { ok: false; error: QuotaError };

/**
 * Pull the OAuth access token from `~/.claude/.credentials.json`.
 * Returns null (not an error) when the file is missing — that's the
 * legitimate "user hasn't logged in" state, and callers should surface
 * it with an install-Claude prompt, not an error toast.
 *
 * The credentials file is rewritten whenever Claude CLI rotates tokens
 * or the Claude Manager profile switcher swaps accounts. A read
 * landing mid-write returns empty or partial JSON, so we re-try once
 * after a short sleep. Without the retry, the quota card falsely
 * reported "No Claude Code credentials" whenever the user clicked
 * Refresh in the same second as a background token refresh.
 */
function readTokenOnce(): { state: "ok" | "missing" | "transient"; token: string | null } {
  let raw: string;
  try {
    raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { state: "missing", token: null };
    return { state: "transient", token: null };
  }
  if (!raw.trim()) return { state: "transient", token: null };
  try {
    const parsed = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } };
    const token = parsed.claudeAiOauth?.accessToken;
    if (typeof token === "string" && token.length > 0) {
      return { state: "ok", token };
    }
    return { state: "missing", token: null };
  } catch {
    // Mid-rewrite reads show truncated JSON — treat as transient.
    return { state: "transient", token: null };
  }
}

/**
 * Three-stage read with exponential backoff. 80ms → 250ms → 600ms
 * covers the typical disk-flush window for a CLI token refresh
 * (<100ms on SSD, occasionally spiky on Windows FS filters or slow
 * antivirus scans). If every attempt observes a transient state, we
 * return `{ kind: "transient" }` so callers can surface a distinct
 * "try again in a moment" error instead of the misleading
 * "no credentials" message.
 */
async function readAccessToken(): Promise<
  | { kind: "ok"; token: string }
  | { kind: "missing" }
  | { kind: "transient" }
> {
  const delays = [80, 250, 600];
  let sawTransient = false;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const r = readTokenOnce();
    if (r.state === "ok" && r.token) return { kind: "ok", token: r.token };
    if (r.state === "missing") return { kind: "missing" };
    sawTransient = true;
    if (attempt < delays.length) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  return sawTransient ? { kind: "transient" } : { kind: "missing" };
}

/**
 * Shape of the OAuth /usage response. Fields null out when a
 * subscription doesn't have that window (e.g. the Pro tier has no
 * per-model 7-day breakdown).
 */
interface OAuthUsageResponse {
  five_hour?: { utilization?: number; resets_at?: string | null } | null;
  seven_day?: { utilization?: number; resets_at?: string | null } | null;
  seven_day_sonnet?: { utilization?: number; resets_at?: string | null } | null;
  seven_day_opus?: { utilization?: number; resets_at?: string | null } | null;
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number | null;
    used_credits?: number | null;
    utilization?: number | null;
    currency?: string | null;
  } | null;
}

/**
 * Normalise a raw `{utilization, resets_at}` OAuth block into the UI
 * shape. Safe to call on `null` or partially-populated objects — that
 * path returns null so the caller can omit the row entirely instead of
 * rendering a bogus "0%" entry.
 */
function normaliseWindow(
  raw: { utilization?: number; resets_at?: string | null } | null | undefined,
): QuotaWindow | null {
  if (!raw) return null;
  const util = typeof raw.utilization === "number" ? raw.utilization : null;
  if (util === null) return null;
  return {
    utilization: util,
    resetsAt: typeof raw.resets_at === "string" ? raw.resets_at : "",
  };
}

/**
 * Fetch the current quota snapshot from the OAuth endpoint.
 *
 * Returns a tagged result rather than throwing so the message handler
 * can forward a typed error to the webview without a try/catch layer
 * in between. Each error kind maps to a distinct UI state:
 *   - no-credentials → "Log in to Claude Code first"
 *   - unauthorized   → "Your token expired. Run `claude` once to refresh."
 *   - network        → "Couldn't reach api.anthropic.com — check connectivity."
 *   - parse          → "Unexpected response; if this keeps happening, report it."
 *   - unknown        → generic fallback with the raw message.
 */
export async function fetchQuota(): Promise<QuotaResult> {
  const read = await readAccessToken();
  return new Promise((resolve) => {
    if (read.kind === "missing") {
      resolve({
        ok: false,
        error: {
          kind: "no-credentials",
          message:
            "No Claude Code credentials found. Run `claude` once to log in, then try again.",
        },
      });
      return;
    }
    if (read.kind === "transient") {
      // Credentials file was mid-rewrite across every retry window —
      // usually means Claude CLI or our own profile switcher is
      // actively rotating tokens. Tell the user to try again in a
      // moment rather than falsely reporting "no credentials".
      resolve({
        ok: false,
        error: {
          kind: "network",
          message:
            "Credentials file is being updated (token rotation or account switch in progress). Try Refresh again in a moment.",
        },
      });
      return;
    }
    const token = read.token;

    const req = https.request(
      {
        host: USAGE_HOST,
        path: USAGE_PATH,
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": BETA_HEADER,
          Accept: "application/json",
          "User-Agent": "claude-manager (vscode extension)",
        },
        timeout: NETWORK_TIMEOUT_MS,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 401) {
            resolve({
              ok: false,
              error: {
                kind: "unauthorized",
                message:
                  "Your Claude Code token is no longer valid. Run `claude` once to refresh it.",
              },
            });
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            resolve({
              ok: false,
              error: {
                kind: "network",
                message: `Quota endpoint returned HTTP ${res.statusCode ?? "??"}.`,
              },
            });
            return;
          }
          let parsed: OAuthUsageResponse;
          try {
            parsed = JSON.parse(body) as OAuthUsageResponse;
          } catch {
            resolve({
              ok: false,
              error: {
                kind: "parse",
                message:
                  "Quota response wasn't valid JSON. The API format may have changed.",
              },
            });
            return;
          }

          const fiveHour = normaliseWindow(parsed.five_hour);
          const sevenDay = normaliseWindow(parsed.seven_day);
          if (!fiveHour || !sevenDay) {
            resolve({
              ok: false,
              error: {
                kind: "parse",
                message:
                  "Quota response was missing the expected five-hour / seven-day fields.",
              },
            });
            return;
          }

          const eu = parsed.extra_usage;
          const extraUsage: QuotaData["extraUsage"] = eu
            ? {
                enabled: Boolean(eu.is_enabled),
                monthlyLimit: typeof eu.monthly_limit === "number" ? eu.monthly_limit : null,
                usedCredits: typeof eu.used_credits === "number" ? eu.used_credits : null,
                utilization: typeof eu.utilization === "number" ? eu.utilization : null,
                currency: typeof eu.currency === "string" ? eu.currency : null,
              }
            : null;

          resolve({
            ok: true,
            data: {
              fiveHour,
              sevenDay,
              sevenDaySonnet: normaliseWindow(parsed.seven_day_sonnet),
              sevenDayOpus: normaliseWindow(parsed.seven_day_opus),
              extraUsage,
              fetchedAt: new Date().toISOString(),
            },
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("request-timeout"));
    });
    req.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        ok: false,
        error: {
          kind: "network",
          message: `Couldn't reach api.anthropic.com (${message}).`,
        },
      });
    });
    req.end();
  });
}
