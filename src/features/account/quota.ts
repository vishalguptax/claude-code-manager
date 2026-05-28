/**
 * Quota + live-session data — read from the statusline cache, with NO
 * network call and NO access to the OAuth token.
 *
 * Background: Anthropic restricts the subscription OAuth credential to
 * the official Claude Code client. A tool calling the usage endpoint
 * with that token (as earlier versions did) violates the Consumer Terms
 * and risks the user's account. The compliant path is to let Claude
 * Code — the authorized client — fetch the data and expose it through
 * its statusline, which our tap caches locally. This module just reads
 * that cache, so it's pure local IO in the same category as reading
 * stats-cache.json or session transcripts.
 *
 * Freshness: the cache is only as current as Claude Code's last
 * statusline render. While a session is active it updates every turn
 * (effectively live); when idle it holds the last-seen values. Callers
 * surface `capturedAt` so the UI can show "as of HH:MM" rather than
 * implying a fresh server reading.
 */
import * as fs from "fs";
import { STATUSLINE_CACHE_FILE } from "../../core/config";
import { isStatuslineInstalled } from "./statuslineInstall";
import type { RateWindow, StatuslineCache } from "./statuslineCore";

/** One rate-limit window as the UI renders it. */
export interface QuotaWindow {
  /** Percentage 0–100 of the window's cap consumed. */
  utilization: number;
  /** ISO timestamp when the window resets, or "" when unknown. */
  resetsAt: string;
}

/** Rolling rate-limit snapshot. Either window is null when Claude omitted it. */
export interface QuotaData {
  /** Rolling 5-hour window — the limit that bites first. */
  fiveHour: QuotaWindow | null;
  /** Rolling 7-day window — the weekly overall cap. */
  sevenDay: QuotaWindow | null;
  /** ISO time Claude Code last rendered the statusline (cache write). */
  capturedAt: string;
  /** ISO time we read the cache (local). */
  fetchedAt: string;
}

/** Current-session live metrics from the same cache. */
export interface LiveSession {
  /** Active model display name, or "" when unknown. */
  model: string;
  /** Context-window usage percentage 0–100, or null. */
  contextUsedPercent: number | null;
  /** Context-window size in tokens, or null. */
  contextSize: number | null;
  /** Current-session cost in USD, or null. */
  sessionCostUsd: number | null;
  /** Lines added this session, or null. */
  linesAdded: number | null;
  /** Lines removed this session, or null. */
  linesRemoved: number | null;
  /** Claude Code version string, or "". */
  version: string;
  /** ISO time Claude Code last rendered the statusline. */
  capturedAt: string;
}

/** Combined payload — quota + live session, both from one cache read. */
export interface QuotaSuccess {
  quota: QuotaData;
  live: LiveSession;
}

/**
 * Error categories map to distinct UI states:
 *   - not-installed → show the "Enable live quota" install CTA
 *   - no-data       → installed, but no usable cache yet. Missing, empty,
 *                     and corrupt all resolve the same way: run a Claude
 *                     session (the tap rewrites the cache), then refresh.
 */
export interface QuotaError {
  kind: "not-installed" | "no-data";
  message: string;
}

export type QuotaResult =
  | { ok: true; data: QuotaSuccess }
  | { ok: false; error: QuotaError };

/** Read + parse the tap's cache file. Null when absent or malformed. */
export function readStatuslineCache(): StatuslineCache | null {
  let raw: string;
  try {
    raw = fs.readFileSync(STATUSLINE_CACHE_FILE, "utf-8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StatuslineCache;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Convert epoch-seconds reset to ISO; resets_at of 0/unknown → "". */
function toWindow(w: RateWindow | null): QuotaWindow | null {
  if (!w) return null;
  return {
    utilization: w.usedPercent,
    resetsAt: w.resetsAt > 0 ? new Date(w.resetsAt * 1000).toISOString() : "",
  };
}

/** Safe ISO from an epoch-ms value; "" when not a finite timestamp. */
function isoFromMs(ms: number): string {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

/**
 * Read the latest quota + live-session snapshot from the local cache.
 * Distinguishes "tap not installed" from "installed but no render yet"
 * so the webview can show the right call-to-action. `workspacePath` is
 * threaded so the installed-check considers project / local scopes too
 * (Claude Code's statusLine precedence: local › project › global).
 * Named `readQuota` (not "fetch") because it performs no network request.
 */
export function readQuota(workspacePath?: string): QuotaResult {
  const cache = readStatuslineCache();
  if (!cache) {
    return isStatuslineInstalled(workspacePath)
      ? {
          ok: false,
          error: {
            kind: "no-data",
            message:
              "No data yet. Open a Claude Code session once — the statusline fills this in — then Refresh.",
          },
        }
      : {
          ok: false,
          error: {
            kind: "not-installed",
            message: "Enable live quota to read it from Claude Code locally.",
          },
        };
  }

  const captured = isoFromMs(cache.capturedAt);
  const fetchedAt = new Date().toISOString();

  return {
    ok: true,
    data: {
      quota: {
        fiveHour: toWindow(cache.rateLimits.fiveHour),
        sevenDay: toWindow(cache.rateLimits.sevenDay),
        capturedAt: captured,
        fetchedAt,
      },
      live: {
        model: cache.model?.displayName ?? "",
        contextUsedPercent: cache.context?.usedPercent ?? null,
        contextSize: cache.context?.size ?? null,
        sessionCostUsd: cache.cost?.totalUsd ?? null,
        linesAdded: cache.cost?.linesAdded ?? null,
        linesRemoved: cache.cost?.linesRemoved ?? null,
        version: cache.version,
        capturedAt: captured,
      },
    },
  };
}
