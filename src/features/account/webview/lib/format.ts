/**
 * Pure formatting + small derivation helpers for the account webview.
 * No DOM, no Preact — extracted from the v1 `view.ts` so the numeric /
 * string logic can be unit-tested directly and reused across
 * components without dragging in render code.
 */

import type { AccountData, UsageStats } from "../../types";
import { cutoffDaysForPeriod, type Period } from "./heatmap";

// Note: the model-picker option builder lived here in v1 but the Account
// tab is identity-only now (Profile + Quota + Usage); model selection
// moved to the Config tab. Kept the file lean — no dead dropdown logic.

/** Format large numbers as 1.2M / 345.2K / 1234. */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Format a ratio in [0, 1] as an integer percent. Falls back to "—". */
export function formatPct(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "—";
  return `${Math.round(ratio * 100)}%`;
}

/** Format ms duration as "11d 23h 57m" or "22h 4m". */
export function formatDuration(ms: number): string {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Shorten model name like "claude-sonnet-4-5-20250929" → "Sonnet 4.5". */
export function formatModelName(model: string): string {
  const m = model.match(/claude-(opus|sonnet|haiku)-(\d+)-?(\d*)/i);
  if (m) {
    const name = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    const version = m[3] ? `${m[2]}.${m[3]}` : m[2];
    return `${name} ${version}`;
  }
  return model;
}

/**
 * ISO 4217 minor-unit decimal counts. The OAuth /usage endpoint and
 * the cost estimates store money in the currency's minor unit (cents,
 * fils, etc.); we divide by 10^digits before rendering. Zero- and
 * three-decimal currencies both occur in the wild — treating
 * everything as two decimals showed AUD users "23346.00" for $233.46.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW",
  "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF",
  "XPF", "XAG", "XAU", "XDR", "XSU", "XUA",
]);
const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND",
]);
const FOUR_DECIMAL_CURRENCIES = new Set(["CLF", "UYW"]);

export function currencyFractionDigits(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  if (FOUR_DECIMAL_CURRENCIES.has(code)) return 4;
  return 2;
}

/**
 * Render a minor-unit integer as a locale-formatted currency string
 * via Intl.NumberFormat. Falls back to "${major} ${currency}" when
 * Intl rejects the code (very old runtime, unknown ISO code).
 */
export function formatMoney(minorUnits: number, currency: string): string {
  const digits = currencyFractionDigits(currency);
  const major = minorUnits / 10 ** digits;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major);
  } catch {
    return `${major.toFixed(digits)} ${currency}`;
  }
}

/**
 * Turn an ISO timestamp into a human "resets in" string — days when
 * >=24h, hours when >=1h, otherwise minutes.
 */
export function formatResetsIn(isoResetsAt: string): string {
  if (!isoResetsAt) return "";
  const resetMs = Date.parse(isoResetsAt);
  if (Number.isNaN(resetMs)) return "";
  const diffMs = resetMs - Date.now();
  if (diffMs <= 0) return "resets now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `resets in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const leftoverMin = mins % 60;
    return leftoverMin > 0 ? `resets in ${hours}h ${leftoverMin}m` : `resets in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const leftoverHours = hours % 24;
  return leftoverHours > 0 ? `resets in ${days}d ${leftoverHours}h` : `resets in ${days}d`;
}

/** Format "Fetched Xm ago" relative to now — tight, scannable. */
export function formatFetchedRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "just now";
  const diff = Date.now() - t;
  if (diff < 10_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return `${Math.floor(diff / 1000)}s ago`;
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

/** Utilization colour tier — drives the bar's mood as the cap nears. */
export function quotaTone(utilizationPct: number): "low" | "mid" | "high" {
  if (utilizationPct >= 80) return "high";
  if (utilizationPct >= 50) return "mid";
  return "low";
}

/**
 * Trim a project path to its trailing 2–3 segments so the row stays
 * scannable in a narrow sidebar. Handles real cwd paths (`\` or `/`)
 * and slug fallbacks (`-`-joined). Full path is kept in a tooltip by
 * the caller.
 */
export function shortenProjectPath(p: string): string {
  if (!p) return "(unknown)";
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join("/");
  const slugParts = p.split("-").filter(Boolean);
  if (slugParts.length >= 3) return slugParts.slice(-3).join("-");
  return p;
}

/**
 * Friendly display name for a tool. MCP tools (`mcp__server__name`)
 * collapse to `server: name`; built-in tools render verbatim.
 */
export function displayToolName(name: string): string {
  if (name.startsWith("mcp__")) {
    const rest = name.slice(5);
    const sep = rest.indexOf("__");
    if (sep > 0) return `${rest.slice(0, sep)}: ${rest.slice(sep + 2)}`;
  }
  return name;
}

/** Tooltip for the cache-hit tile — explains the prompt-cache math. */
export function cacheHitTooltip(u: UsageStats): string {
  if (u.totalCacheReadTokens + u.totalInputTokens === 0) {
    return "No cache activity recorded yet.";
  }
  return (
    `${formatNumber(u.totalCacheReadTokens)} tokens served from prompt cache out of ` +
    `${formatNumber(u.totalCacheReadTokens + u.totalInputTokens)} effective input tokens. ` +
    `Cache writes: ${formatNumber(u.totalCacheCreationTokens)}.`
  );
}

/** Period-filtered usage aggregates for the Usage section. */
export interface UsageTotals {
  tokenTotal: number;
  sessions: number;
  messages: number;
  activeInPeriod: number;
  totalInPeriod: number;
}

/**
 * Aggregate usage stats for the selected period. Anchors the filter to
 * the most recent recorded day (matching the stats-cache `lastComputedDate`
 * convention) so the windows stay consistent with the heatmap.
 */
export function computeUsageTotals(u: UsageStats, period: Period): UsageTotals {
  const latestDataDate =
    u.daily.length > 0 ? u.daily[u.daily.length - 1].date : new Date().toISOString().slice(0, 10);
  const anchor = new Date(latestDataDate).getTime();
  const cutoffDays = cutoffDaysForPeriod(period);
  const withinPeriod = (date: string): boolean =>
    cutoffDays === Number.POSITIVE_INFINITY ||
    (anchor - new Date(date).getTime()) / 86400000 < cutoffDays;

  const filteredActivity = u.daily.filter((d) => withinPeriod(d.date));
  const filteredTokens = u.dailyTokens.filter((d) => withinPeriod(d.date));

  const activeInPeriod = filteredActivity.filter((d) => d.messageCount > 0).length;
  const totalInPeriod = cutoffDays === Number.POSITIVE_INFINITY ? u.totalDays : cutoffDays;

  const sessions =
    period === "all"
      ? u.totalSessions
      : filteredActivity.reduce((acc, d) => acc + d.sessionCount, 0);

  const messages =
    period === "all"
      ? u.totalMessages
      : filteredActivity.reduce((acc, d) => acc + d.messageCount, 0);

  const tokenTotal =
    period === "all" ? u.totalTokens : filteredTokens.reduce((sum, d) => sum + d.total, 0);

  return { tokenTotal, sessions, messages, activeInPeriod, totalInPeriod };
}

/**
 * Identity key for the active account — email + profile slug. A change
 * across an `accountData` message means the user switched accounts, so
 * the quota cache must be invalidated. Slug disambiguates a null-slug
 * "unsaved" account from a saved one with the same email.
 */
export function accountKey(data: AccountData): string {
  const slug = data.activeProfileSlug ?? "";
  const email = data.profile.email ?? "";
  return `${slug}|${email}`;
}
