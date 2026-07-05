/**
 * Persistent daily usage rollup — the extension's own memory of usage
 * history, independent of Claude CLI's caches.
 *
 * Why it exists: Claude CLI purges transcripts older than
 * `cleanupPeriodDays` (default 30), and `stats-cache.json` — the only
 * other historical source — never materialises on some installs. When
 * both are gone, the Usage tab's history silently truncates to the
 * retention window. This module folds every JSONL aggregate pass into
 * `~/.claude/.claude-manager/usage-history.json`, so a day observed
 * once is remembered permanently.
 *
 * Merge rule: element-wise MAX per day. Within a day the aggregate
 * only grows (appends add tokens); after a purge the aggregate for an
 * old day shrinks toward zero. Max keeps the peak — the day's final
 * observed totals — under both movements without needing to know
 * whether a purge happened.
 */
import * as fs from "fs";
import * as path from "path";
import { USAGE_HISTORY_FILE } from "../../core/config";
import { writeFileAtomic } from "../../core/atomicWrite";
import type { UsageAggregate } from "./projectStats";

/** Per-model token buckets for one day. */
export interface HistoryModelTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

/** One remembered day. */
export interface HistoryDay {
  messages: number;
  sessions: number;
  toolCalls: number;
  byModel: Record<string, HistoryModelTokens>;
}

export interface UsageHistory {
  version: 1;
  /** YYYY-MM-DD → rollup. */
  days: Record<string, HistoryDay>;
}

/** Read the rollup. Null when absent, corrupt, or a future version. */
export function readUsageHistory(): UsageHistory | null {
  let raw: string;
  try {
    raw = fs.readFileSync(USAGE_HISTORY_FILE, "utf-8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as UsageHistory;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.version !== 1 ||
      typeof parsed.days !== "object" ||
      parsed.days === null
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function emptyDay(): HistoryDay {
  return { messages: 0, sessions: 0, toolCalls: 0, byModel: {} };
}

/**
 * Fold one aggregate pass into the on-disk rollup. Element-wise max
 * per day (see module doc). Skips the write entirely when nothing
 * grew, so the frequent re-parse paths don't churn the disk. Never
 * throws — history is an enhancement, not a dependency; a failed
 * write must not break the usage computation that triggered it.
 *
 * Returns the merged history so the caller can use it directly instead
 * of re-reading the file it just caused to be written. Null when the
 * aggregate was empty (nothing read) or the fold failed.
 */
export function recordUsageHistory(agg: UsageAggregate): UsageHistory | null {
  if (agg.daily.length === 0 && agg.dailyByModel.length === 0) return null;
  try {
    const history = readUsageHistory() ?? { version: 1 as const, days: {} };
    let changed = false;
    const max = <T, K extends keyof T>(obj: T, key: K, v: T[K] & number): void => {
      if (v > (obj[key] as number)) {
        obj[key] = v;
        changed = true;
      }
    };

    for (const d of agg.daily) {
      const day = (history.days[d.date] ??= emptyDay());
      max(day, "messages", d.messageCount);
      max(day, "sessions", d.sessionCount);
      max(day, "toolCalls", d.toolCallCount);
    }
    for (const d of agg.dailyByModel) {
      const day = (history.days[d.date] ??= emptyDay());
      for (const [model, t] of Object.entries(d.byModel)) {
        const m = (day.byModel[model] ??= {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheCreation: 0,
        });
        max(m, "input", t.input);
        max(m, "output", t.output);
        max(m, "cacheRead", t.cacheRead);
        max(m, "cacheCreation", t.cacheCreation);
      }
    }

    if (changed) {
      fs.mkdirSync(path.dirname(USAGE_HISTORY_FILE), { recursive: true });
      writeFileAtomic(USAGE_HISTORY_FILE, JSON.stringify(history) + "\n");
    }
    return history;
  } catch {
    // best-effort — see doc comment
    return null;
  }
}
