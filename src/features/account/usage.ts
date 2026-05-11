/**
 * Usage stats — hybrid source.
 *
 *   - `~/.claude/stats-cache.json` provides the historical depth.
 *     Claude CLI's cleanup setting (`cleanupPeriodDays`, default 30)
 *     purges old session JSONL files; the cache survives that and
 *     keeps lifetime per-day counters + cumulative `modelUsage`.
 *   - Raw JSONL under `~/.claude/projects/` (via `aggregateUsage`)
 *     provides today's row, fills the gap past `lastComputedDate`,
 *     and supplies the project / tool / MCP breakdowns the cache
 *     can't represent.
 *
 * Why hybrid: pure cache lags by 1–2 days; pure JSONL discards any
 * history older than `cleanupPeriodDays`. Combining gives lifetime
 * depth without losing today's activity. Cache wins on dates
 * `<= lastComputedDate`; JSONL fills everything after. Per-project /
 * per-tool / per-MCP always come from the JSONL walk because the
 * cache has no such dimension.
 *
 * Honours `CLAUDE_CONFIG_DIRS` through the aggregator so multi-profile
 * setups merge correctly.
 */
import * as fs from "fs";
import { STATS_CACHE_FILE } from "../../core/config";
import { PRICES_EFFECTIVE_DATE, computeModelCost } from "../../core/pricing";
import {
  aggregateUsage,
  type UsageAggregate,
  type DailyModelTokens,
} from "./projectStats";
import type {
  DailyActivity,
  DailyTokens,
  ModelStats,
  UsageStats,
} from "./types";

/** Public entry — single source for everything the Usage section renders. */
export function computeUsageStats(): UsageStats {
  const cache = readCache();
  const agg = aggregateUsage();
  const base = cache ? projectCache(cache) : null;

  if (!base && agg.daily.length === 0 && agg.byModel.length === 0) {
    return emptyStats();
  }
  if (!base) {
    // No cache (fresh install). Use JSONL alone.
    return fromAggregate(agg);
  }
  return mergeCacheWithJsonl(base, agg);
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

// ── Merge ────────────────────────────────────────────────────────────

/**
 * Overlay the JSONL aggregate onto the cache-projected base. Cache
 * stays authoritative for dates up to `lastComputedDate`; JSONL fills
 * everything past that. Per-model totals add the post-cutoff JSONL
 * delta to the cache's cumulative figure. Breakdowns (project / tool /
 * MCP) come straight from the JSONL walk regardless of cutoff because
 * the cache has no such dimension.
 */
function mergeCacheWithJsonl(
  base: UsageStats,
  agg: UsageAggregate,
): UsageStats {
  const cutoff = base.lastComputedDate;
  const cutoffMs = cutoff ? Date.parse(cutoff + "T00:00:00") : -Infinity;
  const isPostCutoff = (date: string): boolean =>
    cutoffMs === -Infinity
      ? true
      : Date.parse(date + "T00:00:00") > cutoffMs;

  // Daily rows: cache rows verbatim + JSONL rows for dates past cutoff.
  const cachedDates = new Set(base.daily.map((d) => d.date));
  const extraDaily: DailyActivity[] = agg.daily.filter(
    (d) => !cachedDates.has(d.date) && isPostCutoff(d.date),
  );
  const dailyMerged = [...base.daily, ...extraDaily].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const cachedTokenDates = new Set(base.dailyTokens.map((d) => d.date));
  const extraDailyTokens: DailyTokens[] = agg.dailyTokens.filter(
    (d) => !cachedTokenDates.has(d.date) && isPostCutoff(d.date),
  );
  const dailyTokensMerged = [...base.dailyTokens, ...extraDailyTokens].sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  // byModel: cache lifetime + sum of JSONL `dailyByModel` rows past
  // the cache cutoff. Additive (not max) so any activity that happened
  // after Claude last rebuilt its cache lands on byModel immediately,
  // without waiting for the next cache rebuild. Each post-cutoff day
  // contributes its full bucket detail (input / output / cacheRead /
  // cacheCreation) so cost recomputes from the correct splits.
  const byModelMerged = mergeByModel(base.byModel, agg.dailyByModel, cutoffMs);
  const totalInput = byModelMerged.reduce((s, m) => s + m.inputTokens, 0);
  const totalOutput = byModelMerged.reduce((s, m) => s + m.outputTokens, 0);
  const totalCacheRead = byModelMerged.reduce(
    (s, m) => s + m.cacheReadTokens,
    0,
  );
  const totalCacheCreation = byModelMerged.reduce(
    (s, m) => s + m.cacheCreationTokens,
    0,
  );
  const totalCost = byModelMerged.reduce((s, m) => s + m.costUsd, 0);

  // Sessions / messages: cache's lifetime + JSONL post-cutoff delta.
  // Delta uses sessions/messages that the aggregate records for dates
  // past the cutoff — sums match what the user sees in the recent
  // heatmap.
  let sessionsDelta = 0;
  let messagesDelta = 0;
  for (const d of agg.daily) {
    if (!isPostCutoff(d.date)) continue;
    if (cachedDates.has(d.date)) continue;
    sessionsDelta += d.sessionCount;
    messagesDelta += d.messageCount;
  }

  const firstSessionDate = pickFirstDate(base.firstSessionDate, agg.firstSessionDate);
  // Pick the later of (cache's reported cutoff, latest visible day).
  // Cache may report a cutoff ahead of its own last daily row (e.g.
  // when the day produced no events); JSONL may extend past it. The
  // heatmap uses this to mark cells past it as "stale", so we want the
  // outermost boundary either source provides.
  const lastDataDate = pickLaterDate(
    base.lastComputedDate,
    dailyMerged.at(-1)?.date ?? "",
  );

  return {
    daily: dailyMerged,
    dailyTokens: dailyTokensMerged,
    activeDays: dailyMerged.length,
    totalDays: spanDays(dailyMerged),
    mostActiveDay: mostActiveDayOf(dailyMerged),
    longestStreak: longestStreakOf(dailyMerged),
    currentStreak: currentStreakOf(dailyMerged),
    byModel: byModelMerged,
    favoriteModel: byModelMerged[0]?.model ?? "",
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    totalSessions: base.totalSessions + sessionsDelta,
    totalMessages: base.totalMessages + messagesDelta,
    longestSessionMs: Math.max(base.longestSessionMs, agg.longestSessionMs),
    firstSessionDate,
    // Lift the "stale" boundary past the last JSONL day so freshly
    // filled cells render normally (not hatched).
    lastComputedDate: lastDataDate,
    totalCostUsd: totalCost,
    pricesEffectiveDate: PRICES_EFFECTIVE_DATE,
    totalCacheReadTokens: totalCacheRead,
    totalCacheCreationTokens: totalCacheCreation,
    cacheHitRatio: cacheHitRatioOf(totalCacheRead, totalInput),
    byProject: agg.byProject,
    byTool: agg.byTool,
    byMcpServer: agg.byMcpServer,
  };
}

/**
 * Cache byModel + post-cutoff JSONL delta. Walks the per-day per-model
 * splits the aggregator produced and adds every day whose date is
 * strictly past `cutoffMs` to the cache's cumulative totals. Models
 * that exist only in the JSONL window get inserted; cost recomputes
 * from the merged bucket detail.
 *
 * `cutoffMs === -Infinity` means "no cache cutoff" — treat every JSONL
 * day as a delta. Callers in the cache-fallback / fresh-install path
 * use that to fold the entire aggregate into an otherwise-empty base.
 */
function mergeByModel(
  cacheModels: ModelStats[],
  dailyByModel: DailyModelTokens[],
  cutoffMs: number,
): ModelStats[] {
  type Bucket = {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const m of cacheModels) {
    buckets.set(m.model, {
      input: m.inputTokens,
      output: m.outputTokens,
      cacheRead: m.cacheReadTokens,
      cacheCreation: m.cacheCreationTokens,
    });
  }
  for (const day of dailyByModel) {
    if (cutoffMs !== -Infinity) {
      const dayMs = Date.parse(day.date + "T00:00:00");
      if (!Number.isFinite(dayMs) || dayMs <= cutoffMs) continue;
    }
    for (const [model, t] of Object.entries(day.byModel)) {
      let b = buckets.get(model);
      if (!b) {
        b = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
        buckets.set(model, b);
      }
      b.input += t.input;
      b.output += t.output;
      b.cacheRead += t.cacheRead;
      b.cacheCreation += t.cacheCreation;
    }
  }
  const out: ModelStats[] = [];
  for (const [model, b] of buckets.entries()) {
    out.push({
      model,
      inputTokens: b.input,
      outputTokens: b.output,
      totalTokens: b.input + b.output,
      cacheReadTokens: b.cacheRead,
      cacheCreationTokens: b.cacheCreation,
      costUsd: computeModelCost(model, {
        input: b.input,
        output: b.output,
        cacheRead: b.cacheRead,
        cacheWrite: b.cacheCreation,
      }),
    });
  }
  return out.sort((a, b) => b.totalTokens - a.totalTokens);
}

function pickFirstDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function pickLaterDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Build UsageStats from the JSONL aggregate alone — used when no
 * `stats-cache.json` exists yet (fresh install).
 */
function fromAggregate(agg: UsageAggregate): UsageStats {
  return {
    daily: agg.daily,
    dailyTokens: agg.dailyTokens,
    activeDays: agg.daily.length,
    totalDays: spanDays(agg.daily),
    mostActiveDay: mostActiveDayOf(agg.daily),
    longestStreak: longestStreakOf(agg.daily),
    currentStreak: currentStreakOf(agg.daily),
    byModel: agg.byModel,
    favoriteModel: agg.byModel[0]?.model ?? "",
    totalInputTokens: agg.totalInputTokens,
    totalOutputTokens: agg.totalOutputTokens,
    totalTokens: agg.totalTokens,
    totalSessions: agg.totalSessions,
    totalMessages: agg.totalMessages,
    longestSessionMs: agg.longestSessionMs,
    firstSessionDate: agg.firstSessionDate,
    lastComputedDate: agg.daily.at(-1)?.date ?? "",
    totalCostUsd: agg.totalCostUsd,
    pricesEffectiveDate: PRICES_EFFECTIVE_DATE,
    totalCacheReadTokens: agg.totalCacheReadTokens,
    totalCacheCreationTokens: agg.totalCacheCreationTokens,
    cacheHitRatio: cacheHitRatioOf(
      agg.totalCacheReadTokens,
      agg.totalInputTokens,
    ),
    byProject: agg.byProject,
    byTool: agg.byTool,
    byMcpServer: agg.byMcpServer,
  };
}

function cacheHitRatioOf(cacheRead: number, input: number): number {
  const denom = cacheRead + input;
  return denom > 0 ? cacheRead / denom : 0;
}

// ── stats-cache.json projection ──────────────────────────────────────

interface CacheModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
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
  tokensByModel?: Record<string, number>;
}

interface CacheLongestSession {
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

function projectCache(cache: StatsCacheShape): UsageStats {
  const result = emptyStats();
  result.daily = (cache.dailyActivity ?? [])
    .filter(
      (d): d is CacheDailyActivity & { date: string } =>
        typeof d.date === "string" && d.date.length > 0,
    )
    .map((d) => ({
      date: d.date,
      messageCount: typeof d.messageCount === "number" ? d.messageCount : 0,
      sessionCount: typeof d.sessionCount === "number" ? d.sessionCount : 0,
      toolCallCount: typeof d.toolCallCount === "number" ? d.toolCallCount : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  result.dailyTokens = (cache.dailyModelTokens ?? [])
    .filter(
      (d): d is CacheDailyModelTokens & { date: string } =>
        typeof d.date === "string" && d.date.length > 0,
    )
    .map((d) => ({ date: d.date, total: sumModelMap(d.tokensByModel) }))
    .sort((a, b) => a.date.localeCompare(b.date));

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
      result.totalCacheReadTokens += cacheReadTokens;
      result.totalCacheCreationTokens += cacheCreationTokens;
      result.totalCostUsd += costUsd;
    }
  }
  modelList.sort((a, b) => b.totalTokens - a.totalTokens);
  result.byModel = modelList;
  result.favoriteModel = modelList[0]?.model ?? "";
  result.totalTokens = result.totalInputTokens + result.totalOutputTokens;
  result.cacheHitRatio = cacheHitRatioOf(
    result.totalCacheReadTokens,
    result.totalInputTokens,
  );

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

  result.activeDays = result.daily.length;
  result.mostActiveDay = mostActiveDayOf(result.daily);
  result.totalDays = spanDays(result.daily);
  result.longestStreak = longestStreakOf(result.daily);
  result.currentStreak = currentStreakOf(result.daily);

  return result;
}

function sumModelMap(map: Record<string, number> | undefined): number {
  if (!map) return 0;
  let s = 0;
  for (const v of Object.values(map)) {
    if (typeof v === "number") s += v;
  }
  return s;
}

function isoDate(s: string | undefined): string {
  if (typeof s !== "string" || s.length < 10) return "";
  return s.slice(0, 10);
}

// ── Derivers ─────────────────────────────────────────────────────────

function mostActiveDayOf(daily: DailyActivity[]): string {
  let best = -1;
  let day = "";
  for (const d of daily) {
    if (d.messageCount > best) {
      best = d.messageCount;
      day = d.date;
    }
  }
  return day;
}

function spanDays(daily: DailyActivity[]): number {
  if (daily.length === 0) return 0;
  const firstMs = parseLocalDate(daily[0].date);
  const lastMs = parseLocalDate(daily[daily.length - 1].date);
  return Math.max(1, Math.round((lastMs - firstMs) / 86_400_000) + 1);
}

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
  let cursor = daily[daily.length - 1].date;
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = previousLocalDate(cursor);
  }
  return streak;
}

function parseLocalDate(iso: string): number {
  return new Date(iso + "T00:00:00").getTime();
}

function previousLocalDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    cacheHitRatio: 0,
    byProject: [],
    byTool: [],
    byMcpServer: [],
  };
}

// ── Test-only export ─────────────────────────────────────────────
export const __internals = {
  projectCache,
  mergeCacheWithJsonl,
  fromAggregate,
  longestStreakOf,
  currentStreakOf,
  cacheHitRatioOf,
  mostActiveDayOf,
  spanDays,
};
