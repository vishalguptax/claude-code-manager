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
 * Result is memoised by a fingerprint over every transcript file
 * (slug count + summed file mtime/size). The second open of the tab is
 * near-instant even with thousands of transcripts, yet an append to a
 * live session's transcript still invalidates the memo.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CLAUDE_DIR } from "../../core/config";
import { compareModelRecencyDesc, computeModelCost } from "../../core/pricing";
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

/**
 * Minimal projection of one JSONL line — everything `AggState` consumes
 * and nothing else. Cached per file (keyed on mtime+size) so an append
 * to one live transcript re-reads only that file; every other file
 * replays its compact entries without touching disk or JSON.parse.
 * Kept small on purpose: no message content, no raw line.
 */
interface CompactEntry {
  type?: string;
  uuid?: string;
  /** Assistant fallback dedup key when the line lacks a uuid. */
  messageId?: string;
  tsMs: number;
  /** Local YYYY-MM-DD of the timestamp, "" when unparseable. */
  date: string;
  sessionId?: string;
  cwd?: string;
  isSidechain?: boolean;
  /** Token buckets — present only for assistant lines with usage. */
  model?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheCreation?: number;
  /** tool_use block names on assistant lines. */
  toolNames?: string[];
}

/** Parse one raw JSONL line into its compact projection. Null when the
 * line is empty or malformed JSON. */
function compactLine(line: string): CompactEntry | null {
  if (!line) return null;
  let entry: JsonlEntry;
  try {
    entry = JSON.parse(line) as JsonlEntry;
  } catch {
    return null;
  }
  const out: CompactEntry = {
    tsMs: parseTs(entry.timestamp),
    date: isoLocalDate(entry.timestamp),
  };
  if (typeof entry.type === "string") out.type = entry.type;
  if (typeof entry.uuid === "string" && entry.uuid) out.uuid = entry.uuid;
  if (typeof entry.sessionId === "string" && entry.sessionId) {
    out.sessionId = entry.sessionId;
  }
  if (typeof entry.cwd === "string" && entry.cwd) out.cwd = entry.cwd;
  if (entry.isSidechain === true) out.isSidechain = true;
  const msg = entry.message;
  if (entry.type === "assistant" && msg) {
    if (typeof msg.id === "string") out.messageId = msg.id;
    if (msg.usage && typeof msg.model === "string") {
      out.model = msg.model;
      out.input = numOr0(msg.usage.input_tokens);
      out.output = numOr0(msg.usage.output_tokens);
      out.cacheRead = numOr0(msg.usage.cache_read_input_tokens);
      out.cacheCreation = numOr0(msg.usage.cache_creation_input_tokens);
    }
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          block &&
          typeof block === "object" &&
          (block as { type?: string }).type === "tool_use"
        ) {
          const name = (block as { name?: string }).name ?? "";
          if (!name) continue;
          (out.toolNames ??= []).push(name);
        }
      }
    }
  }
  return out;
}

/** Per-day per-model token split. Used by usage.ts to compute the
 *  post-cutoff delta when merging with stats-cache.json's lifetime
 *  byModel — the alternative (max-merge) loses today's activity until
 *  Claude rebuilds its cache. */
export interface DailyModelTokens {
  date: string;
  /** model id → token buckets for that day. */
  byModel: Record<
    string,
    {
      input: number;
      output: number;
      cacheRead: number;
      cacheCreation: number;
    }
  >;
}

/** Full payload the aggregator returns — one shape, no follow-up reads. */
export interface UsageAggregate {
  daily: DailyActivity[];
  dailyTokens: DailyTokens[];
  dailyByModel: DailyModelTokens[];
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
  /** Per-model token split for this day — feeds DailyModelTokens. */
  byModel: Map<string, ModelAcc>;
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
 * Module-scope memo. Fingerprint = slug count + summed (mtime + size)
 * of every transcript file across every config dir. File-level stats
 * (not just dir mtimes) are what let it detect mid-session appends.
 */
let cachedFingerprint = -1;
let cachedResult: UsageAggregate | null = null;

/**
 * Per-file compact-entry cache keyed on mtime+size. When one live
 * transcript appends, only that file is re-read and re-parsed; every
 * other file's entries replay from memory. The replay itself (not the
 * IO/parse) is what preserves the cross-file uuid dedup that a naive
 * per-file rollup merge would break.
 */
interface FileCacheEntry {
  mtimeMs: number;
  size: number;
  entries: CompactEntry[];
}
const fileCache = new Map<string, FileCacheEntry>();

/** In-flight background aggregation, deduped so bursts share one pass. */
let warming: Promise<UsageAggregate> | null = null;

/**
 * Synchronous, NON-BLOCKING accessor for the account render path. Returns the
 * memoised aggregate (or an empty one on a cold cache) and kicks a background
 * refresh — it never reads the transcript corpus on the caller's thread.
 *
 * This matters because aggregation reads *every* JSONL transcript, and it is
 * bundled into `parseAccountData`, which runs on every settings open and
 * account push. Doing that read synchronously froze the extension host for
 * seconds whenever an active session had grown the corpus. The heavy work now
 * lives in {@link warmUsageAggregate}; the UI shows the last-known totals
 * immediately and updates when the async pass completes.
 */
export function aggregateUsage(): UsageAggregate {
  void warmUsageAggregate();
  return cachedResult ?? emptyAggregate();
}

/**
 * Recompute the usage aggregate off the event loop and refresh the memo.
 * Reads run via `fs.promises` and the parse loop yields every few files, so a
 * large corpus never monopolises the host. Concurrent calls share one pass;
 * an unchanged fingerprint short-circuits without re-reading. Callers that
 * need fresh totals (activation warm, the throttled usage push, reload) await
 * this, then read the now-warm cache via `aggregateUsage`.
 */
export async function warmUsageAggregate(): Promise<UsageAggregate> {
  if (warming) return warming;
  warming = (async () => {
    try {
      const dirs = projectDirs();
      if (dirs.length === 0) {
        cachedFingerprint = 0;
        cachedResult = emptyAggregate();
        return cachedResult;
      }

      // Fingerprint over every transcript file (mtime + size), not just the
      // project directories. A directory's mtime only moves when an entry is
      // created/renamed/deleted — appending tokens to an *existing* transcript
      // (exactly what an active session does) leaves the parent dir mtime
      // untouched, so a dir-only fingerprint would freeze the usage tab.
      let fp = 0;
      const allFiles: Array<{
        slug: string;
        filePath: string;
        mtimeMs: number;
        size: number;
      }> = [];
      for (const projectsDir of dirs) {
        let slugs: string[];
        try {
          slugs = await fs.promises.readdir(projectsDir);
        } catch {
          continue;
        }
        fp += slugs.length;
        for (const slug of slugs) {
          const projDir = path.join(projectsDir, slug);
          let files: string[];
          try {
            files = await fs.promises.readdir(projDir);
          } catch {
            continue;
          }
          for (const f of files) {
            if (!f.endsWith(".jsonl")) continue;
            const filePath = path.join(projDir, f);
            try {
              const st = await fs.promises.stat(filePath);
              fp += st.mtimeMs + st.size;
              allFiles.push({ slug, filePath, mtimeMs: st.mtimeMs, size: st.size });
            } catch {
              continue;
            }
          }
        }
      }
      if (cachedResult && fp === cachedFingerprint) return cachedResult;

      // Evict cache entries for deleted files so memory tracks the corpus.
      const livePaths = new Set(allFiles.map((f) => f.filePath));
      for (const key of fileCache.keys()) {
        if (!livePaths.has(key)) fileCache.delete(key);
      }

      const state = new AggState();
      let i = 0;
      for (const { slug, filePath, mtimeMs, size } of allFiles) {
        let cached = fileCache.get(filePath);
        if (!cached || cached.mtimeMs !== mtimeMs || cached.size !== size) {
          // Changed or new — the only files that pay IO + JSON.parse.
          let raw: string;
          try {
            raw = await fs.promises.readFile(filePath, "utf-8");
          } catch {
            fileCache.delete(filePath);
            continue;
          }
          const entries: CompactEntry[] = [];
          const lines = raw.split("\n");
          for (let li = 0; li < lines.length; li++) {
            const e = compactLine(lines[li]);
            if (e) entries.push(e);
            // Yield WITHIN a large file too, not just between files. An
            // active session's transcript can grow to hundreds of MB, and
            // re-parsing it on every throttled usage push would otherwise
            // block the host mid-file — starving a just-opened tab's data
            // request. 20k lines ≈ a few ms of parse between yields.
            if ((li & 0x4fff) === 0x4fff) await new Promise((r) => setImmediate(r));
          }
          cached = { mtimeMs, size, entries };
          fileCache.set(filePath, cached);
        }
        state.ingestEntries(cached.entries, slug);
        // Yield to the event loop periodically so a huge corpus doesn't
        // block UI messages while the (synchronous) JSON parse runs.
        if (++i % 8 === 0) await new Promise((r) => setImmediate(r));
      }

      const result = state.finalise();
      cachedFingerprint = fp;
      cachedResult = result;
      return result;
    } finally {
      warming = null;
    }
  })();
  return warming;
}

/**
 * True while no aggregate has been computed yet (cold start, or just
 * reset by a reload / account switch). The Usage UI uses this to show
 * "indexing usage history" instead of presenting the empty aggregate's
 * zeros as final numbers. Once a result exists, later re-warms refresh
 * in the background and this stays false — stale-but-real data beats a
 * spinner.
 */
export function isUsageAggregateWarming(): boolean {
  return cachedResult === null;
}

/** Reset the memo. Tests and forced refresh paths call this. */
export function resetUsageAggregateCache(): void {
  cachedFingerprint = -1;
  cachedResult = null;
  warming = null;
  fileCache.clear();
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
      const entry = compactLine(line);
      if (entry) this.ingestCompact(entry, acc);
    }
  }

  /** Replay pre-parsed compact entries for one file. */
  ingestEntries(entries: CompactEntry[], slug: string): void {
    const acc = this.projectAcc(slug);
    for (const entry of entries) this.ingestCompact(entry, acc);
  }

  private ingestCompact(entry: CompactEntry, acc: ProjectAcc): void {
    // Dedup: uuid first (covers user + assistant), message.id as a
    // belt-and-braces for assistants whose lines lack uuid. Global
    // across files — a resumed session re-appends prior turns into a
    // new transcript with the same uuids.
    if (entry.uuid) {
      if (this.seenUuids.has(entry.uuid)) return;
      this.seenUuids.add(entry.uuid);
    } else if (entry.type === "assistant" && entry.messageId) {
      if (this.seenMessageIds.has(entry.messageId)) return;
      this.seenMessageIds.add(entry.messageId);
    }

    if (acc.path === acc.slug && entry.cwd) {
      acc.path = entry.cwd;
    }

    const tsMs = entry.tsMs;
    if (tsMs > 0 && tsMs < this.firstTsMs) this.firstTsMs = tsMs;

    if (entry.sessionId) {
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

    const date = entry.date;
    if (date && date > acc.lastActiveDate) acc.lastActiveDate = date;
    const day = date ? this.dayAcc(date) : null;
    if (day && entry.sessionId) {
      day.sessions.add(entry.sessionId);
    }

    if (entry.type === "user" && !entry.isSidechain) {
      acc.messages++;
      this.totalMessages++;
      if (day) day.messages++;
    }

    if (entry.type === "assistant") {
      this.ingestAssistant(entry, acc, day);
    }
  }

  private ingestAssistant(
    entry: CompactEntry,
    acc: ProjectAcc,
    day: DayAcc | null,
  ): void {
    const model = entry.model;
    if (typeof model === "string") {
      const inT = entry.input ?? 0;
      const outT = entry.output ?? 0;
      const crT = entry.cacheRead ?? 0;
      const ccT = entry.cacheCreation ?? 0;
      bump(acc.inputByModel, model, inT);
      bump(acc.outputByModel, model, outT);
      bump(acc.cacheReadByModel, model, crT);
      bump(acc.cacheCreationByModel, model, ccT);
      const m = this.modelAcc(model);
      m.input += inT;
      m.output += outT;
      m.cacheRead += crT;
      m.cacheCreation += ccT;
      if (day) {
        // Per-day token total is input + output only — matches Claude
        // CLI's `dailyModelTokens.tokensByModel` semantic. Cache tokens
        // tracked separately on day.byModel so the post-cutoff delta
        // can fold full bucket detail into the cache merge.
        day.tokens += inT + outT;
        let dm = day.byModel.get(model);
        if (!dm) {
          dm = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
          day.byModel.set(model, dm);
        }
        dm.input += inT;
        dm.output += outT;
        dm.cacheRead += crT;
        dm.cacheCreation += ccT;
      }
    }
    if (entry.toolNames) {
      for (const name of entry.toolNames) {
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
        byModel: new Map(),
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
    const dailyByModel = this.buildDailyByModel();
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
      dailyByModel,
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
    out.sort(compareModelRecencyDesc);
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

  private buildDailyByModel(): DailyModelTokens[] {
    const out: DailyModelTokens[] = [];
    for (const d of this.days.values()) {
      if (d.byModel.size === 0) continue;
      const byModel: DailyModelTokens["byModel"] = {};
      for (const [model, m] of d.byModel.entries()) {
        byModel[model] = {
          input: m.input,
          output: m.output,
          cacheRead: m.cacheRead,
          cacheCreation: m.cacheCreation,
        };
      }
      out.push({ date: d.date, byModel });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
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
    dailyByModel: [],
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
