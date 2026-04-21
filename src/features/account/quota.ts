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
 */
function readAccessToken(): string | null {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken?: string };
    };
    const token = parsed.claudeAiOauth?.accessToken;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
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
export function fetchQuota(): Promise<QuotaResult> {
  return new Promise((resolve) => {
    const token = readAccessToken();
    if (!token) {
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
