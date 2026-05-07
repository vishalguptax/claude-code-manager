/**
 * Usage stats — read straight from `~/.claude/stats-cache.json`,
 * the same file Claude CLI's `/stats` reads. By projecting that
 * cache verbatim we guarantee one set of numbers across the
 * extension and the terminal: tokens, sessions, messages, the
 * heatmap cells, and the per-model breakdown all match `/stats`
 * to the digit.
 *
 * Tradeoff: Claude rebuilds the cache on its own cadence (often
 * 1–2 days behind today). The heatmap reflects that — today's
 * cell renders as "stale" until the CLI re-aggregates. Reading
 * raw transcripts would surface today's activity immediately, but
 * the resulting numbers diverged from `/stats` (sub-agent walks,
 * history-filtered session count, different cache_creation
 * accounting), and the divergence was the user-facing bug. Two
 * sources of truth is worse than one slightly-lagging source.
 *
 * If the cache is missing or unreadable (first-run users, fresh
 * install) we return zeroed stats — the UI shows its empty state
 * inviting the user to start a Claude session.
 */
import * as fs from "fs";
import { STATS_CACHE_FILE } from "../../core/config";
import { computeModelCost, PRICES_EFFECTIVE_DATE } from "../../core/pricing";
import { aggregateJsonlSince, type JsonlDayAgg } from "./jsonlFallback";
import type {
  DailyActivity,
  DailyTokens,
  ModelStats,
  UsageStats,
} from "./types";

// ── stats-cache.json shape (only the fields we project) ──

interface CacheModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Tokens served from prompt cache. Field absent on older caches. */
  cacheReadInputTokens?: number;
  /** Tokens written to prompt cache. Field absent on older caches. */
  cacheCreationInputTokens?: number;
}

interface CacheDailyActivity {
  date?: string;
  messageCount?: number;
  sessionCount?: number;
  toolCallCount?: number;
}

interface CacheDailyModelTokens {
  date?: string;
  /** Per-model totals already summed by Claude (input + output). */
  tokensByModel?: Record<string, number>;
}

interface CacheLongestSession {
  /** Milliseconds. */
  duration?: number;
}

interface StatsCacheShape {
  lastComputedDate?: string;
  dailyActivity?: CacheDailyActivity[];
  dailyModelTokens?: CacheDailyModelTokens[];
  modelUsage?: Record<string, CacheModelUsage>;
  totalSessions?: number;
  totalMessages?: number;
  longestSession?: CacheLongestSession;
  firstSessionDate?: string;
}

// ── Public entry ──

/**
 * Build UsageStats by projecting `~/.claude/stats-cache.json`. Cheap
 * to call (small file, one read), so callers don't need their own
 * caching layer — the prior FileSummary cache is gone.
 */
export function computeUsageStats(): UsageStats {
  const cache = readCache();
  if (!cache) return emptyStats();
  const projected = projectCache(cache);
  // Cache lags Claude CLI's actual cadence (often days). Fill the
  // gap [lastComputedDate+1, today] from raw session JSONL so the
  // heatmap and period totals reflect reality. Drift on cache-cutoff
  // day is acceptable; the alternative (showing a half-empty
  // heatmap) is a worse user experience.
  return augmentWithJsonl(projected);
}

function readCache(): StatsCacheShape | null {
  let raw: string;
  try {
    raw = fs.readFileSync(STATS_CACHE_FILE, "utf-8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as StatsCacheShape;
  } catch {
    return null;
  }
}

// ── Projection ──

function projectCache(cache: StatsCacheShape): UsageStats {
  const result = emptyStats();

  // dailyActivity → daily. Filter rows missing a date — the cache
  // is generally well-formed, but a guard avoids an undefined
  // string sneaking into streak math downstream.
  result.daily = (cache.dailyActivity ?? [])
    .filter((d): d is CacheDailyActivity & { date: string } =>
      typeof d.date === "string" && d.date.length > 0,
    )
    .map((d) => ({
      date: d.date,
      messageCount: typeof d.messageCount === "number" ? d.messageCount : 0,
      sessionCount: typeof d.sessionCount === "number" ? d.sessionCount : 0,
      toolCallCount: typeof d.toolCallCount === "number" ? d.toolCallCount : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // dailyModelTokens → dailyTokens. Each row's `tokensByModel` map
  // already holds per-model totals (Claude pre-sums input + output);
  // we sum across models for the headline per-day number.
  result.dailyTokens = (cache.dailyModelTokens ?? [])
    .filter((d): d is CacheDailyModelTokens & { date: string } =>
      typeof d.date === "string" && d.date.length > 0,
    )
    .map<DailyTokens>((d) => ({
      date: d.date,
      total: sumModelMap(d.tokensByModel),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // modelUsage → byModel. Sort by totalTokens desc so the top entry
  // is the user's favorite model. Cost is layered on at projection
  // time using the price snapshot in core/pricing — keeping it in
  // the projector means the heavy stats-cache parse runs once.
  const modelList: ModelStats[] = [];
  if (cache.modelUsage) {
    for (const [model, t] of Object.entries(cache.modelUsage)) {
      const inputTokens = t.inputTokens ?? 0;
      const outputTokens = t.outputTokens ?? 0;
      const cacheReadTokens = t.cacheReadInputTokens ?? 0;
      const cacheCreationTokens = t.cacheCreationInputTokens ?? 0;
      const costUsd = computeModelCost(model, {
        input: inputTokens,
        output: outputTokens,
        cacheRead: cacheReadTokens,
        cacheWrite: cacheCreationTokens,
      });
      modelList.push({
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        costUsd,
      });
      result.totalInputTokens += inputTokens;
      result.totalOutputTokens += outputTokens;
      result.totalCostUsd += costUsd;
    }
  }
  modelList.sort((a, b) => b.totalTokens - a.totalTokens);
  result.byModel = modelList;
  result.favoriteModel = modelList[0]?.model ?? "";
  result.totalTokens = result.totalInputTokens + result.totalOutputTokens;

  // Direct field projections.
  result.totalSessions =
    typeof cache.totalSessions === "number" ? cache.totalSessions : 0;
  result.totalMessages =
    typeof cache.totalMessages === "number" ? cache.totalMessages : 0;
  result.longestSessionMs =
    typeof cache.longestSession?.duration === "number"
      ? cache.longestSession.duration
      : 0;
  result.firstSessionDate = isoDate(cache.firstSessionDate);
  result.lastComputedDate =
    typeof cache.lastComputedDate === "string" ? cache.lastComputedDate : "";

  // Derived fields from `daily`.
  result.activeDays = result.daily.length;

  let mostActiveCount = -1;
  let mostActiveDay = "";
  for (const d of result.daily) {
    if (d.messageCount > mostActiveCount) {
      mostActiveCount = d.messageCount;
      mostActiveDay = d.date;
    }
  }
  result.mostActiveDay = mostActiveDay;

  if (result.daily.length > 0) {
    const firstMs = parseLocalDate(result.daily[0].date);
    const lastMs = parseLocalDate(result.daily[result.daily.length - 1].date);
    result.totalDays = Math.max(
      1,
      Math.round((lastMs - firstMs) / 86_400_000) + 1,
    );
  }

  result.longestStreak = longestStreakOf(result.daily);
  result.currentStreak = currentStreakOf(result.daily);

  return result;
}

function sumModelMap(map: Record<string, number> | undefined): number {
  if (!map) return 0;
  let sum = 0;
  for (const v of Object.values(map)) {
    if (typeof v === "number") sum += v;
  }
  return sum;
}

/**
 * Slice a YYYY-MM-DD prefix from an ISO timestamp. `firstSessionDate`
 * in the cache is a full ISO string ("2025-12-31T06:52:..."); the UI
 * only wants the date portion.
 */
function isoDate(s: string | undefined): string {
  if (typeof s !== "string" || s.length < 10) return "";
  return s.slice(0, 10);
}

// ── Streak helpers ──

function longestStreakOf(daily: DailyActivity[]): number {
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of daily) {
    if (!prev) {
      run = 1;
    } else {
      const diff = Math.round(
        (parseLocalDate(d.date) - parseLocalDate(prev)) / 86_400_000,
      );
      run = diff === 1 ? run + 1 : 1;
    }
    if (run > longest) longest = run;
    prev = d.date;
  }
  return longest;
}

function currentStreakOf(daily: DailyActivity[]): number {
  if (daily.length === 0) return 0;
  const dates = new Set(daily.map((d) => d.date));
  // Walk backwards from the latest active date (not wall-clock
  // today — matches CLI `/stats` which doesn't penalise a not-yet-
  // active day).
  let cursor = daily[daily.length - 1].date;
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = previousLocalDate(cursor);
  }
  return streak;
}

// ── Date helpers ──

/** Parse YYYY-MM-DD as local midnight ms. */
function parseLocalDate(iso: string): number {
  return new Date(iso + "T00:00:00").getTime();
}

/** YYYY-MM-DD shifted back one calendar day in local time. */
function previousLocalDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── JSONL gap-fill ──

/**
 * Merge JSONL-derived rows for dates past `cache.lastComputedDate`
 * into the projected stats. Mutates and returns `stats` for the
 * caller's convenience. Only touches the gap window — fully-cached
 * dates stay verbatim from the cache.
 */
function augmentWithJsonl(stats: UsageStats): UsageStats {
  const startDate = gapStartDate(stats.lastComputedDate);
  if (!startDate) return stats;

  const gap = aggregateJsonlSince(startDate);
  if (gap.length === 0) return stats;

  const cachedDates = new Set(stats.daily.map((d) => d.date));
  const newDailyActivity: DailyActivity[] = [];
  const newDailyTokens: DailyTokens[] = [];

  // Per-model totals to fold into byModel. Tracking the same four
  // counters the cache uses keeps cost recomputation accurate.
  const inputDelta: Record<string, number> = {};
  const outputDelta: Record<string, number> = {};
  const cacheReadDelta: Record<string, number> = {};
  const cacheCreationDelta: Record<string, number> = {};
  const allSessionIds = new Set<string>();
  let messagesDelta = 0;

  for (const day of gap) {
    if (cachedDates.has(day.date)) continue;
    newDailyActivity.push({
      date: day.date,
      messageCount: day.messageCount,
      sessionCount: day.sessionCount,
      toolCallCount: day.toolCallCount,
    });
    const tokenTotal = sumNumberMap(day.tokensByModel);
    if (tokenTotal > 0) {
      newDailyTokens.push({ date: day.date, total: tokenTotal });
    }
    foldInto(inputDelta, day.inputByModel);
    foldInto(outputDelta, day.outputByModel);
    foldInto(cacheReadDelta, day.cacheReadByModel);
    foldInto(cacheCreationDelta, day.cacheCreationByModel);
    for (const id of day.sessionIds) allSessionIds.add(id);
    messagesDelta += day.messageCount;
  }

  if (newDailyActivity.length === 0 && newDailyTokens.length === 0) return stats;

  stats.daily = [...stats.daily, ...newDailyActivity].sort((a, b) => a.date.localeCompare(b.date));
  stats.dailyTokens = [...stats.dailyTokens, ...newDailyTokens].sort((a, b) => a.date.localeCompare(b.date));

  // Update lastComputedDate so the heatmap doesn't render the
  // newly-filled days as "stale".
  if (stats.daily.length > 0) {
    stats.lastComputedDate = stats.daily[stats.daily.length - 1].date;
  }

  // Fold per-model deltas into byModel. New models added; existing
  // models accumulate. Costs recomputed from updated input/output.
  const byModelMap = new Map<string, ModelStats>();
  for (const m of stats.byModel) byModelMap.set(m.model, { ...m });
  const allModels = new Set<string>([
    ...byModelMap.keys(),
    ...Object.keys(inputDelta),
    ...Object.keys(outputDelta),
    ...Object.keys(cacheReadDelta),
    ...Object.keys(cacheCreationDelta),
  ]);
  for (const model of allModels) {
    const existing = byModelMap.get(model);
    const inputTokens = (existing?.inputTokens ?? 0) + (inputDelta[model] ?? 0);
    const outputTokens = (existing?.outputTokens ?? 0) + (outputDelta[model] ?? 0);
    const cacheReadTokens = (existing?.cacheReadTokens ?? 0) + (cacheReadDelta[model] ?? 0);
    const cacheCreationTokens = (existing?.cacheCreationTokens ?? 0) + (cacheCreationDelta[model] ?? 0);
    const costUsd = computeModelCost(model, {
      input: inputTokens,
      output: outputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheCreationTokens,
    });
    byModelMap.set(model, {
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costUsd,
    });
  }
  stats.byModel = [...byModelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  stats.favoriteModel = stats.byModel[0]?.model ?? stats.favoriteModel;

  // Resync the totals derived from byModel.
  stats.totalInputTokens = stats.byModel.reduce((s, m) => s + m.inputTokens, 0);
  stats.totalOutputTokens = stats.byModel.reduce((s, m) => s + m.outputTokens, 0);
  stats.totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
  stats.totalCostUsd = stats.byModel.reduce((s, m) => s + m.costUsd, 0);

  // Sessions / messages — additive. Cross-midnight sessions can
  // double-count vs the cache, but the gap window is small enough
  // that the user-visible impact is negligible. The "Period totals
  // approximate" footer in the UI already covers this.
  stats.totalMessages = stats.totalMessages + messagesDelta;
  stats.totalSessions = stats.totalSessions + allSessionIds.size;

  // Refresh derived fields that depend on `daily`.
  stats.activeDays = stats.daily.length;
  if (stats.daily.length > 0) {
    const firstMs = parseLocalDate(stats.daily[0].date);
    const lastMs = parseLocalDate(stats.daily[stats.daily.length - 1].date);
    stats.totalDays = Math.max(1, Math.round((lastMs - firstMs) / 86_400_000) + 1);
  }
  stats.longestStreak = longestStreakOf(stats.daily);
  stats.currentStreak = currentStreakOf(stats.daily);
  let mostActiveCount = -1;
  let mostActiveDay = "";
  for (const d of stats.daily) {
    if (d.messageCount > mostActiveCount) {
      mostActiveCount = d.messageCount;
      mostActiveDay = d.date;
    }
  }
  stats.mostActiveDay = mostActiveDay;

  return stats;
}

/** Day after `lastComputedDate`, or "" when no anchor is available. */
function gapStartDate(lastComputedDate: string): string {
  if (!lastComputedDate) return "";
  const d = new Date(lastComputedDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sumNumberMap(map: Record<string, number>): number {
  let s = 0;
  for (const v of Object.values(map)) s += v;
  return s;
}

function foldInto(dst: Record<string, number>, src: Record<string, number>): void {
  for (const [k, v] of Object.entries(src)) {
    if (v === 0) continue;
    dst[k] = (dst[k] ?? 0) + v;
  }
}

function emptyStats(): UsageStats {
  return {
    daily: [],
    dailyTokens: [],
    activeDays: 0,
    totalDays: 0,
    mostActiveDay: "",
    longestStreak: 0,
    currentStreak: 0,
    byModel: [],
    favoriteModel: "",
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalSessions: 0,
    totalMessages: 0,
    longestSessionMs: 0,
    firstSessionDate: "",
    lastComputedDate: "",
    totalCostUsd: 0,
    pricesEffectiveDate: PRICES_EFFECTIVE_DATE,
  };
}

// ── Test-only export ─────────────────────────────────────────────
// Streak helpers + cache projector exposed for unit tests so they
// can drive the math directly without round-tripping through the
// filesystem.
export const __internals = {
  projectCache,
  longestStreakOf,
  currentStreakOf,
  augmentWithJsonl,
  gapStartDate,
};
