/**
 * Single-pass JSONL aggregator for the Account / Usage tab.
 *
 * Walks every session transcript under `~/.claude/projects/` (plus any
 * directories listed in `CLAUDE_CONFIG_DIRS`) once and emits the full
 * payload the UI needs:
 *
 *   - Headline totals (tokens, sessions, messages, cost, longest session,
 *     first session date)
 *   - Per-day activity + tokens (drives the heatmap + period filter)
 *   - Per-model rollups (input / output / cache split, sorted by total)
 *   - Per-project breakdown (sessions, messages, tokens, cost, last active)
 *   - Per-tool invocation counts
 *   - Per-MCP-server usage (collapsed from `mcp__<server>__<tool>` names)
 *
 * Why JSONL-primary (instead of projecting `~/.claude/stats-cache.json`):
 *   - The cache lags Claude CLI's actual cadence by 1–2 days, sometimes
 *     more. JSONL is always live, so today's row reflects reality.
 *   - The cache buckets by date + model only — it has no project, tool,
 *     or MCP dimension, so anything richer than the heatmap already
 *     required a JSONL walk. One walk is cheaper than two.
 *   - We dedup by message `uuid`, so resumed sessions that re-append
 *     prior turns don't inflate counts.
 *
 * Result is memoised by a fingerprint over the project directories
 * (count + summed mtimes). The second open of the tab is near-instant
 * even with thousands of transcripts.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CLAUDE_DIR } from "../../core/config";
import { computeModelCost } from "../../core/pricing";
import type {
  DailyActivity,
  DailyTokens,
  ModelStats,
  ProjectStats,
  ToolStats,
  McpServerUsage,
} from "./types";

interface JsonlEntry {
  type?: string;
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  isSidechain?: boolean;
  message?: {
    id?: string;
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

/** Full payload the aggregator returns — one shape, no follow-up reads. */
export interface UsageAggregate {
  daily: DailyActivity[];
  dailyTokens: DailyTokens[];
  byModel: ModelStats[];
  byProject: ProjectStats[];
  byTool: ToolStats[];
  byMcpServer: McpServerUsage[];
  totalSessions: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  longestSessionMs: number;
  /** YYYY-MM-DD of the earliest entry across every project. "" when empty. */
  firstSessionDate: string;
}

/** Per-project mutable accumulator used while walking the JSONL files. */
interface ProjectAcc {
  path: string;
  slug: string;
  sessions: Set<string>;
  messages: number;
  inputByModel: Map<string, number>;
  outputByModel: Map<string, number>;
  cacheReadByModel: Map<string, number>;
  cacheCreationByModel: Map<string, number>;
  lastActiveDate: string;
}

/** Per-day mutable accumulator. */
interface DayAcc {
  date: string;
  messages: number;
  sessions: Set<string>;
  toolCalls: number;
  tokens: number;
}

interface ModelAcc {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

interface SessionTimes {
  min: number;
  max: number;
}

/**
 * Module-scope memo. Fingerprint = count + summed mtimes across every
 * project directory in every config dir. Detects new sessions, edits,
 * and config-dir changes without per-file stat calls.
 */
let cachedFingerprint = -1;
let cachedResult: UsageAggregate | null = null;

/**
 * Aggregate all JSONL transcripts into a single usage payload. Safe to
 * call from the account-tab render path — repeated calls return the
 * memoised result unless the project dirs have changed.
 */
export function aggregateUsage(): UsageAggregate {
  const dirs = projectDirs();
  if (dirs.length === 0) return emptyAggregate();

  // Fingerprint over every (configDir, slug) pair. Cheap to compute
  // because we only stat the project directories themselves, not the
  // individual session files inside.
  let fp = 0;
  const allEntries: Array<{ projectsDir: string; slug: string }> = [];
  for (const projectsDir of dirs) {
    let slugs: string[];
    try {
      slugs = fs.readdirSync(projectsDir);
    } catch {
      continue;
    }
    fp += slugs.length;
    for (const slug of slugs) {
      try {
        fp += fs.statSync(path.join(projectsDir, slug)).mtimeMs;
      } catch {
        // missing entry — skip in fingerprint
      }
      allEntries.push({ projectsDir, slug });
    }
  }
  if (cachedResult && fp === cachedFingerprint) return cachedResult;

  const state = new AggState();
  for (const { projectsDir, slug } of allEntries) {
    const projDir = path.join(projectsDir, slug);
    let files: string[];
    try {
      files = fs.readdirSync(projDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      let raw: string;
      try {
        raw = fs.readFileSync(path.join(projDir, f), "utf-8");
      } catch {
        continue;
      }
      state.ingest(raw, slug);
    }
  }

  const result = state.finalise();
  cachedFingerprint = fp;
  cachedResult = result;
  return result;
}

/** Reset the memo. Tests and forced refresh paths call this. */
export function resetUsageAggregateCache(): void {
  cachedFingerprint = -1;
  cachedResult = null;
}

/** Backwards-compatible alias kept for the existing test surface. */
export const resetProjectStatsCache = resetUsageAggregateCache;

/**
 * Resolve the list of project directories to walk. Always includes
 * `~/.claude/projects`. When `CLAUDE_CONFIG_DIRS` is set, each entry
 * is treated as an alternate `~/.claude` root and its `projects`
 * subdirectory is added.
 *
 * Separator follows the platform convention: `:` on POSIX, `;` on
 * Windows. Mirrors codeburn's behaviour for multi-profile setups.
 */
function projectDirs(): string[] {
  const dirs = new Set<string>();
  dirs.add(path.join(CLAUDE_DIR, "projects"));
  const env = process.env.CLAUDE_CONFIG_DIRS;
  if (env) {
    for (const raw of env.split(path.delimiter)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const expanded = trimmed.startsWith("~")
        ? path.join(os.homedir(), trimmed.slice(1))
        : trimmed;
      dirs.add(path.join(expanded, "projects"));
    }
  }
  return [...dirs];
}

/** Mutable state container — folded into one class so helper methods can
 * mutate the same maps without a long parameter list. */
class AggState {
  /** Per-line uuid dedup. Same uuid across two reads = same logical entry
   * (resumed session re-appending prior turns). */
  private readonly seenUuids = new Set<string>();
  /** Backup dedup for assistants by API message.id — older transcripts
   * sometimes lack a per-line uuid. */
  private readonly seenMessageIds = new Set<string>();

  private readonly projects = new Map<string, ProjectAcc>();
  private readonly days = new Map<string, DayAcc>();
  private readonly modelTotals = new Map<string, ModelAcc>();
  private readonly toolCounts = new Map<string, number>();
  private readonly mcpServers = new Map<
    string,
    { calls: number; tools: Set<string> }
  >();
  private readonly sessionTimes = new Map<string, SessionTimes>();
  private readonly globalSessions = new Set<string>();

  private firstTsMs = Infinity;
  private totalMessages = 0;

  ingest(raw: string, slug: string): void {
    const acc = this.projectAcc(slug);
    for (const line of raw.split("\n")) {
      if (!line) continue;
      let entry: JsonlEntry;
      try {
        entry = JSON.parse(line) as JsonlEntry;
      } catch {
        continue;
      }
      this.ingestEntry(entry, acc);
    }
  }

  private ingestEntry(entry: JsonlEntry, acc: ProjectAcc): void {
    // Dedup: uuid first (covers user + assistant), message.id as a
    // belt-and-braces for assistants whose lines lack uuid.
    if (typeof entry.uuid === "string" && entry.uuid) {
      if (this.seenUuids.has(entry.uuid)) return;
      this.seenUuids.add(entry.uuid);
    } else if (
      entry.type === "assistant" &&
      typeof entry.message?.id === "string"
    ) {
      const id = entry.message.id;
      if (this.seenMessageIds.has(id)) return;
      this.seenMessageIds.add(id);
    }

    if (acc.path === acc.slug && typeof entry.cwd === "string" && entry.cwd) {
      acc.path = entry.cwd;
    }

    const tsMs = parseTs(entry.timestamp);
    if (tsMs > 0 && tsMs < this.firstTsMs) this.firstTsMs = tsMs;

    if (typeof entry.sessionId === "string" && entry.sessionId) {
      const sid = entry.sessionId;
      acc.sessions.add(sid);
      this.globalSessions.add(sid);
      if (tsMs > 0) {
        const existing = this.sessionTimes.get(sid);
        if (!existing) {
          this.sessionTimes.set(sid, { min: tsMs, max: tsMs });
        } else {
          if (tsMs < existing.min) existing.min = tsMs;
          if (tsMs > existing.max) existing.max = tsMs;
        }
      }
    }

    const date = isoLocalDate(entry.timestamp);
    if (date && date > acc.lastActiveDate) acc.lastActiveDate = date;
    const day = date ? this.dayAcc(date) : null;
    if (day && typeof entry.sessionId === "string" && entry.sessionId) {
      day.sessions.add(entry.sessionId);
    }

    if (entry.type === "user" && !entry.isSidechain) {
      acc.messages++;
      this.totalMessages++;
      if (day) day.messages++;
    }

    if (entry.type === "assistant" && entry.message) {
      this.ingestAssistant(entry, acc, day);
    }
  }

  private ingestAssistant(
    entry: JsonlEntry,
    acc: ProjectAcc,
    day: DayAcc | null,
  ): void {
    const msg = entry.message;
    if (!msg) return;
    const usage = msg.usage;
    const model = msg.model;
    if (usage && typeof model === "string") {
      const inT = numOr0(usage.input_tokens);
      const outT = numOr0(usage.output_tokens);
      const crT = numOr0(usage.cache_read_input_tokens);
      const ccT = numOr0(usage.cache_creation_input_tokens);
      bump(acc.inputByModel, model, inT);
      bump(acc.outputByModel, model, outT);
      bump(acc.cacheReadByModel, model, crT);
      bump(acc.cacheCreationByModel, model, ccT);
      const m = this.modelAcc(model);
      m.input += inT;
      m.output += outT;
      m.cacheRead += crT;
      m.cacheCreation += ccT;
      // Per-day token total includes cache buckets to match Claude
      // CLI's `dailyModelTokens.tokensByModel` semantic (input + output
      // + cache_read + cache_creation). The `byModel.totalTokens`
      // field stays input+output because Claude's lifetime `modelUsage`
      // is reported that way — they're two different scopes with
      // different summing rules; we mirror both verbatim so the
      // weekly/monthly numbers don't drift across the cache-cutoff
      // boundary.
      if (day) day.tokens += inT + outT + crT + ccT;
    }
    const content = msg.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === "object" &&
          (block as { type?: string }).type === "tool_use"
        ) {
          const name = (block as { name?: string }).name ?? "";
          if (!name) continue;
          this.toolCounts.set(name, (this.toolCounts.get(name) ?? 0) + 1);
          if (day) day.toolCalls++;
          const mcp = parseMcpTool(name);
          if (mcp) {
            let s = this.mcpServers.get(mcp.server);
            if (!s) {
              s = { calls: 0, tools: new Set() };
              this.mcpServers.set(mcp.server, s);
            }
            s.calls++;
            s.tools.add(mcp.tool);
          }
        }
      }
    }
  }

  private projectAcc(slug: string): ProjectAcc {
    let acc = this.projects.get(slug);
    if (!acc) {
      acc = {
        path: slug,
        slug,
        sessions: new Set(),
        messages: 0,
        inputByModel: new Map(),
        outputByModel: new Map(),
        cacheReadByModel: new Map(),
        cacheCreationByModel: new Map(),
        lastActiveDate: "",
      };
      this.projects.set(slug, acc);
    }
    return acc;
  }

  private dayAcc(date: string): DayAcc {
    let d = this.days.get(date);
    if (!d) {
      d = {
        date,
        messages: 0,
        sessions: new Set(),
        toolCalls: 0,
        tokens: 0,
      };
      this.days.set(date, d);
    }
    return d;
  }

  private modelAcc(model: string): ModelAcc {
    let m = this.modelTotals.get(model);
    if (!m) {
      m = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
      this.modelTotals.set(model, m);
    }
    return m;
  }

  finalise(): UsageAggregate {
    const byProject = this.buildByProject();
    const byModel = this.buildByModel();
    const daily = this.buildDaily();
    const dailyTokens = this.buildDailyTokens();
    const byTool = [...this.toolCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const byMcpServer = [...this.mcpServers.entries()]
      .map(([server, v]) => ({
        server,
        toolCount: v.calls,
        uniqueTools: v.tools.size,
      }))
      .sort((a, b) => b.toolCount - a.toolCount);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalCostUsd = 0;
    for (const m of byModel) {
      totalInputTokens += m.inputTokens;
      totalOutputTokens += m.outputTokens;
      totalCacheReadTokens += m.cacheReadTokens;
      totalCacheCreationTokens += m.cacheCreationTokens;
      totalCostUsd += m.costUsd;
    }

    let longestSessionMs = 0;
    for (const t of this.sessionTimes.values()) {
      const span = t.max - t.min;
      if (span > longestSessionMs) longestSessionMs = span;
    }

    return {
      daily,
      dailyTokens,
      byModel,
      byProject,
      byTool,
      byMcpServer,
      totalSessions: this.globalSessions.size,
      totalMessages: this.totalMessages,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalCostUsd,
      longestSessionMs,
      firstSessionDate:
        this.firstTsMs === Infinity ? "" : isoLocalDateFromMs(this.firstTsMs),
    };
  }

  private buildByProject(): ProjectStats[] {
    const out: ProjectStats[] = [];
    for (const acc of this.projects.values()) {
      let inputTotal = 0;
      let outputTotal = 0;
      let costUsd = 0;
      const models = new Set([
        ...acc.inputByModel.keys(),
        ...acc.outputByModel.keys(),
        ...acc.cacheReadByModel.keys(),
        ...acc.cacheCreationByModel.keys(),
      ]);
      for (const model of models) {
        const input = acc.inputByModel.get(model) ?? 0;
        const output = acc.outputByModel.get(model) ?? 0;
        const cacheRead = acc.cacheReadByModel.get(model) ?? 0;
        const cacheWrite = acc.cacheCreationByModel.get(model) ?? 0;
        inputTotal += input;
        outputTotal += output;
        costUsd += computeModelCost(model, {
          input,
          output,
          cacheRead,
          cacheWrite,
        });
      }
      if (acc.sessions.size === 0 && inputTotal + outputTotal === 0) continue;
      out.push({
        path: acc.path,
        slug: acc.slug,
        sessions: acc.sessions.size,
        messages: acc.messages,
        tokens: inputTotal + outputTotal,
        costUsd,
        lastActiveDate: acc.lastActiveDate,
      });
    }
    out.sort((a, b) => b.tokens - a.tokens);
    return out;
  }

  private buildByModel(): ModelStats[] {
    const out: ModelStats[] = [];
    for (const [model, m] of this.modelTotals.entries()) {
      const totalTokens = m.input + m.output;
      if (totalTokens === 0 && m.cacheRead + m.cacheCreation === 0) continue;
      out.push({
        model,
        inputTokens: m.input,
        outputTokens: m.output,
        totalTokens,
        cacheReadTokens: m.cacheRead,
        cacheCreationTokens: m.cacheCreation,
        costUsd: computeModelCost(model, {
          input: m.input,
          output: m.output,
          cacheRead: m.cacheRead,
          cacheWrite: m.cacheCreation,
        }),
      });
    }
    out.sort((a, b) => b.totalTokens - a.totalTokens);
    return out;
  }

  private buildDaily(): DailyActivity[] {
    return [...this.days.values()]
      .map((d) => ({
        date: d.date,
        messageCount: d.messages,
        sessionCount: d.sessions.size,
        toolCallCount: d.toolCalls,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private buildDailyTokens(): DailyTokens[] {
    return [...this.days.values()]
      .filter((d) => d.tokens > 0)
      .map((d) => ({ date: d.date, total: d.tokens }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

function parseMcpTool(name: string): { server: string; tool: string } | null {
  if (!name.startsWith("mcp__")) return null;
  const rest = name.slice(5);
  const sep = rest.indexOf("__");
  if (sep <= 0) return null;
  return { server: rest.slice(0, sep), tool: rest.slice(sep + 2) };
}

function bump(map: Map<string, number>, key: string, n: number): void {
  if (n === 0) return;
  map.set(key, (map.get(key) ?? 0) + n);
}

function numOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function parseTs(iso: string | undefined): number {
  if (typeof iso !== "string") return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function isoLocalDate(iso: string | undefined): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatLocalDate(d);
}

function isoLocalDateFromMs(ms: number): string {
  return formatLocalDate(new Date(ms));
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyAggregate(): UsageAggregate {
  return {
    daily: [],
    dailyTokens: [],
    byModel: [],
    byProject: [],
    byTool: [],
    byMcpServer: [],
    totalSessions: 0,
    totalMessages: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    totalCostUsd: 0,
    longestSessionMs: 0,
    firstSessionDate: "",
  };
}

// ── Backwards-compatible alias for the prior surface ────────────────
// `aggregateProjectStats()` was the first iteration's only export.
// Tests and downstream code still reference that name; export the
// richer payload under the same key so external callers don't break.
export const aggregateProjectStats = aggregateUsage;
