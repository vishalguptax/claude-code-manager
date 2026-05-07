/**
 * JSONL fallback aggregator. Claude CLI rebuilds `~/.claude/stats-cache.json`
 * on its own cadence — typically 1–2 days behind, occasionally many days
 * if the user hasn't run a session that triggers a rebuild. The cache is
 * the only source for the Account tab's stats, so a stale cache hides
 * recent activity from the heatmap and period totals.
 *
 * This module reads the raw session JSONL transcripts under
 * `~/.claude/projects/<slug>/<sessionId>.jsonl` and aggregates per-day
 * counters for any date past the cache cutoff. Result is merged into
 * the cache projection so the visible window matches reality.
 *
 * Tradeoff (called out in usage.ts): Claude `/stats` and the raw
 * transcript walk can disagree by ~5–15% on the cache cutoff day —
 * different sub-agent attribution, cache-read accounting, and message
 * filtering. We accept that drift for the gap window in exchange for
 * showing the user their actual recent activity.
 */
import * as fs from "fs";
import * as path from "path";
import { PROJECTS_DIR } from "../../core/config";

export interface JsonlDayAgg {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
  /** Per-model input + output sum (matches cache.dailyModelTokens shape). */
  tokensByModel: Record<string, number>;
  inputByModel: Record<string, number>;
  outputByModel: Record<string, number>;
  cacheReadByModel: Record<string, number>;
  cacheCreationByModel: Record<string, number>;
  /** Unique session ids touched on this date. */
  sessionIds: Set<string>;
}

/**
 * Walk every JSONL under PROJECTS_DIR, accumulating per-day counters
 * for entries whose timestamp lands on or after `startDateInclusive`
 * (YYYY-MM-DD, local time). File scanning is mtime-gated — files
 * untouched since startDate are skipped without reading.
 */
export function aggregateJsonlSince(startDateInclusive: string): JsonlDayAgg[] {
  const startMs = Date.parse(startDateInclusive + "T00:00:00");
  if (Number.isNaN(startMs)) return [];

  const byDate = new Map<string, JsonlDayAgg>();

  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return [];
  }

  for (const slug of projectDirs) {
    const projectDir = path.join(PROJECTS_DIR, slug);
    let files: string[];
    try {
      files = fs.readdirSync(projectDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const fp = path.join(projectDir, f);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fp);
      } catch {
        continue;
      }
      // mtime gate — file never touched since startDate cannot
      // contribute rows in the gap window.
      if (stat.mtimeMs < startMs) continue;
      let raw: string;
      try {
        raw = fs.readFileSync(fp, "utf-8");
      } catch {
        continue;
      }
      ingestLines(raw, startMs, byDate);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function ingestLines(
  raw: string,
  startMs: number,
  byDate: Map<string, JsonlDayAgg>,
): void {
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let entry: JsonlEntry;
    try {
      entry = JSON.parse(line) as JsonlEntry;
    } catch {
      continue;
    }
    const ts = entry.timestamp;
    if (typeof ts !== "string") continue;
    const date = isoLocalDate(ts);
    if (!date) continue;
    if (Date.parse(date + "T00:00:00") < startMs) continue;

    const day = getOrInit(byDate, date);
    if (typeof entry.sessionId === "string" && entry.sessionId) {
      day.sessionIds.add(entry.sessionId);
    }

    if (entry.type === "user" && !entry.isSidechain) {
      day.messageCount++;
    }

    if (entry.type === "assistant" && entry.message) {
      const usage = entry.message.usage;
      const model = entry.message.model;
      if (usage && typeof model === "string") {
        const inT = numOr0(usage.input_tokens);
        const outT = numOr0(usage.output_tokens);
        const crT = numOr0(usage.cache_read_input_tokens);
        const ccT = numOr0(usage.cache_creation_input_tokens);
        addInto(day.tokensByModel, model, inT + outT);
        addInto(day.inputByModel, model, inT);
        addInto(day.outputByModel, model, outT);
        addInto(day.cacheReadByModel, model, crT);
        addInto(day.cacheCreationByModel, model, ccT);
      }
      const content = entry.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === "object" && (block as { type?: string }).type === "tool_use") {
            day.toolCallCount++;
          }
        }
      }
    }
  }

  // Recompute sessionCount from unique ids — set size is authoritative.
  for (const day of byDate.values()) {
    day.sessionCount = day.sessionIds.size;
  }
}

function getOrInit(byDate: Map<string, JsonlDayAgg>, date: string): JsonlDayAgg {
  let day = byDate.get(date);
  if (!day) {
    day = {
      date,
      messageCount: 0,
      sessionCount: 0,
      toolCallCount: 0,
      tokensByModel: {},
      inputByModel: {},
      outputByModel: {},
      cacheReadByModel: {},
      cacheCreationByModel: {},
      sessionIds: new Set<string>(),
    };
    byDate.set(date, day);
  }
  return day;
}

function addInto(map: Record<string, number>, key: string, n: number): void {
  if (n === 0) return;
  map[key] = (map[key] ?? 0) + n;
}

function numOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** YYYY-MM-DD in local time from an ISO timestamp. Matches stats-cache.json keys. */
function isoLocalDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Internal types — minimal projections of the JSONL line shape ──

interface JsonlEntry {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  isSidechain?: boolean;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    content?: unknown;
  };
}
