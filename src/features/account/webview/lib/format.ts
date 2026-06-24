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
  // A reset time in the past means the cached window already rolled over
  // since Claude Code last rendered — the figure is stale, not "resetting
  // now". Surface staleness instead of a misleading countdown.
  if (diffMs <= 0) return "outdated · open Claude to refresh";
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

/**
 * Format "Fetched Xm ago" relative to now — tight, scannable. `now` is
 * injectable so the relative string is deterministic in tests; callers
 * normally omit it and get wall-clock.
 */
export function formatFetchedRelative(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "just now";
  const diff = now - t;
  if (diff < 10_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return `${Math.floor(diff / 1000)}s ago`;
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Past this age the cached quota is treated as "idle" — no Claude render
 * has refreshed it recently, so the bars are last-known rather than live.
 * 10 min comfortably exceeds an active session's render cadence (every
 * turn) without flapping during a brief pause between prompts.
 */
export const QUOTA_STALE_AFTER_MS = 10 * 60_000;

export interface QuotaFreshness {
  /** Relative age of the capture, e.g. "5m ago". */
  text: string;
  /** True once the capture is old enough to be "idle" / last-known. */
  stale: boolean;
}

/**
 * Freshness of the cached quota. The quota number is fetched by Claude
 * Code (the only authorized client) and cached on its statusline render;
 * we can only read that cache, never force a server fetch. So when no
 * render has happened recently the figure is last-known, not live — this
 * lets the UI say so instead of presenting frozen bars as current.
 */
export function quotaFreshness(capturedIso: string, now: number = Date.now()): QuotaFreshness {
  const t = Date.parse(capturedIso);
  if (Number.isNaN(t)) return { text: "just now", stale: false };
  return { text: formatFetchedRelative(capturedIso, now), stale: now - t >= QUOTA_STALE_AFTER_MS };
}

/** Capitalize a subscription slug for display: "max" → "Max". */
export function formatPlanName(sub: string): string {
  if (!sub) return "";
  return sub.charAt(0).toUpperCase() + sub.slice(1);
}

/**
 * Human plan label, matching Anthropic's plan vocabulary (Free / Pro /
 * Max 5x / Max 20x / Team). The tier *family* comes from
 * `subscriptionType`; the usage multiplier is appended only when the
 * `rateLimitTier` slug carries the parseable "Nx" form (e.g.
 * "default_claude_max_20x" → "Max 20x"). Lowercase "x" matches Anthropic's
 * own naming.
 *
 * Team is shown bare ("Team"): the Standard (1.25×) vs Premium (6.25×)
 * seat is NOT in any decodable local field — the slug is an opaque
 * codename ("default_raven"), and the only model signals on disk
 * (`settings.json` model, the live model) reflect the *user's* choice,
 * not the seat's recommended default. Anthropic doesn't write the seat
 * default anywhere we can read, so inferring it would just be reading
 * back the user's own override — we don't guess. Price is excluded too
 * (region/currency marketing data, not account data).
 */
export function formatPlan(subscriptionType: string, rateLimitTier: string): string {
  const family = formatPlanName(subscriptionType);
  if (!family) return "";
  const slugMult = rateLimitTier.match(/(\d+)\s*x/i);
  return slugMult ? `${family} ${slugMult[1]}x` : family;
}

/**
 * Format an ISO date as "Mon YYYY" (e.g. "Mar 2024") for the "plan since"
 * row. Returns "" when the timestamp is missing or unparseable so the
 * caller can omit the row entirely.
 */
export function formatJoinedDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short" });
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

/**
 * Abbreviated currency for tight columns: $22.4K, $1.5M, $345.12.
 * Below $1,000 we keep two decimals so small spend reads exactly;
 * above that, one decimal + K/M suffix keeps the figure two-or-three
 * characters wide so seven legend rows still line up at narrow widths.
 */
export function formatMoneyCompact(minorUnits: number, currency: string): string {
  const digits = currencyFractionDigits(currency);
  const major = minorUnits / 10 ** digits;
  const sign = major < 0 ? "-" : "";
  const abs = Math.abs(major);
  const symbol = currency.toUpperCase() === "USD" ? "$" : currency;
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${symbol}${abs.toFixed(digits)}`;
}
