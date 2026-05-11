/**
 * Usage stats — sourced primarily from raw session JSONL via
 * `aggregateUsage` so the panel reflects what's on disk right now.
 *
 * Previous versions of this module projected `~/.claude/stats-cache.json`
 * (the same file Claude CLI's `/stats` reads). That gave bit-exact parity
 * with `/stats`, but the cache lags Claude's actual cadence by 1–2 days
 * (sometimes more) and has no project / tool / MCP dimension. The new
 * JSONL-primary path:
 *
 *   - Is always live — today's row reflects the user's actual activity.
 *   - Carries the richer breakdowns we now surface (project, tool, MCP)
 *     without a second walk.
 *   - Dedups by entry `uuid` / `message.id`, so resumed sessions that
 *     re-append prior turns don't inflate counters.
 *   - Honours `CLAUDE_CONFIG_DIRS` so multi-profile setups (e.g.
 *     `~/.claude-work:~/.claude-personal`) merge correctly.
 *
 * `~/.claude/stats-cache.json` is still consulted as a fallback when no
 * JSONL files exist at all — covers a fresh install before the first
 * session writes anything, where the cache may already exist from a
 * prior Claude CLI run that pre-dated the manager extension.
 */
import * as fs from "fs";
import { STATS_CACHE_FILE } from "../../core/config";
import { PRICES_EFFECTIVE_DATE, computeModelCost } from "../../core/pricing";
import { aggregateUsage, type UsageAggregate } from "./projectStats";
import type {
  DailyActivity,
  ModelStats,
  UsageStats,
} from "./types";

/** Public entry — single source for everything the Usage section renders. */
export function computeUsageStats(): UsageStats {
  const agg = aggregateUsage();
  if (agg.daily.length === 0 && agg.byModel.length === 0) {
    // No transcripts on disk yet. Surface whatever the legacy cache
    // holds so users who already have a /stats history aren't greeted
    // by an empty panel on first install.
    return projectCacheFallback();
  }
  return fromAggregate(agg);
}

/**
 * Build the full UsageStats payload from the JSONL aggregate. Derived
 * fields (streaks, totalDays, mostActiveDay) compute over the daily
 * series so they stay consistent with what the heatmap shows.
 */
function fromAggregate(agg: UsageAggregate): UsageStats {
  const stats: UsageStats = {
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
    // JSONL is the source — there's no "computed up to" anchor. We set
    // this to the latest active date so the heatmap doesn't hatch
    // recent cells as stale.
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
  return stats;
}

/**
 * Cache hit ratio = cacheRead / (cacheRead + input). Reads what the
 * user effectively spent on context — anything served from cache saved
 * them a fresh-input round trip. cacheCreation isn't in the denominator
 * because creation writes happen regardless of hit/miss; this metric
 * answers "how much input was reused," not "how efficient was every
 * byte we paid for."
 */
function cacheHitRatioOf(cacheRead: number, input: number): number {
  const denom = cacheRead + input;
  return denom > 0 ? cacheRead / denom : 0;
}

// ── stats-cache.json fallback (fresh-install only) ───────────────────

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

/**
 * Used when no JSONL is on disk. Reads `stats-cache.json` so the UI can
 * still show something — but this branch is rare in normal use (any
 * session the user runs writes a transcript first).
 */
function projectCacheFallback(): UsageStats {
  let raw: string;
  try {
    raw = fs.readFileSync(STATS_CACHE_FILE, "utf-8");
  } catch {
    return emptyStats();
  }
  let cache: StatsCacheShape;
  try {
    cache = JSON.parse(raw) as StatsCacheShape;
  } catch {
    return emptyStats();
  }

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
      toolCallCount:
        typeof d.toolCallCount === "number" ? d.toolCallCount : 0,
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
      modelList.push({
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        costUsd: computeModelCost(model, {
          input: inputTokens,
          output: outputTokens,
          cacheRead: cacheReadTokens,
          cacheWrite: cacheCreationTokens,
        }),
      });
      result.totalInputTokens += inputTokens;
      result.totalOutputTokens += outputTokens;
      result.totalCacheReadTokens += cacheReadTokens;
      result.totalCacheCreationTokens += cacheCreationTokens;
      result.totalCostUsd += modelList[modelList.length - 1].costUsd;
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

// ── Derivers (shared between JSONL + fallback paths) ─────────────────

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
  fromAggregate,
  projectCacheFallback,
  longestStreakOf,
  currentStreakOf,
  cacheHitRatioOf,
  mostActiveDayOf,
  spanDays,
};
