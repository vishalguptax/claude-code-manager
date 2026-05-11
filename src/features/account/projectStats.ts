/**
 * Walk every session JSONL under `~/.claude/projects/` once and aggregate:
 *
 *   - Per-project totals (sessions, messages, tokens, est. cost, last
 *     active date). Project identity uses the JSONL `cwd` field (the
 *     real filesystem path Claude saw) when present, falling back to
 *     the directory slug if no entry exposed `cwd` yet.
 *   - Per-tool call counts across all tool_use blocks — surfaces what
 *     the user actually drives Claude with.
 *   - Per-MCP-server usage — collapses `mcp__<server>__<tool>` tool
 *     names back to the server they came from, so unused MCP servers
 *     in the user's config become obvious cleanup candidates.
 *
 * Why a separate full-walk module (vs reusing `jsonlFallback`):
 *   - `jsonlFallback` is mtime-gated to a recent window so the heatmap
 *     gap-fill stays fast. The breakdowns here want every file, not
 *     just the gap window, so we accept the heavier walk.
 *   - Result is cached in module scope keyed by a fingerprint of the
 *     project directory (file count + summed mtimes). Re-reads only
 *     happen when a session file changes, so the second tab open is
 *     near-instant even with thousands of transcripts.
 */
import * as fs from "fs";
import * as path from "path";
import { PROJECTS_DIR } from "../../core/config";
import { computeModelCost } from "../../core/pricing";
import type { ProjectStats, ToolStats, McpServerUsage } from "./types";

interface JsonlEntry {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
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

export interface ProjectBreakdown {
  byProject: ProjectStats[];
  byTool: ToolStats[];
  byMcpServer: McpServerUsage[];
}

/** Per-project mutable accumulator used while walking the JSONL files. */
interface ProjectAcc {
  /** Display path — `cwd` from the JSONL when known, else the slug. */
  path: string;
  /** Directory slug under PROJECTS_DIR. Stable id; survives cwd absence. */
  slug: string;
  sessions: Set<string>;
  messages: number;
  inputByModel: Map<string, number>;
  outputByModel: Map<string, number>;
  cacheReadByModel: Map<string, number>;
  cacheCreationByModel: Map<string, number>;
  /** Latest YYYY-MM-DD seen for this project. */
  lastActiveDate: string;
}

/**
 * Module-scope memo. Key = sum of file mtimes + count. Cheap to compute
 * and detects any session-file write or new session creation.
 */
let cachedFingerprint = -1;
let cachedResult: ProjectBreakdown | null = null;

/**
 * Aggregate all JSONL transcripts into per-project / per-tool / per-MCP
 * breakdowns. Safe to call from the account-tab render path — repeated
 * calls return the memoised result unless the project dir has changed.
 */
export function aggregateProjectStats(): ProjectBreakdown {
  let entries: string[];
  try {
    entries = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return emptyBreakdown();
  }

  // Fingerprint: count + summed mtimes across project directories.
  // Per-file stat would be more precise but costs another N stat calls
  // every render; project-dir mtime updates when files inside change,
  // which is sufficient for invalidation.
  let fp = entries.length;
  for (const slug of entries) {
    try {
      fp += fs.statSync(path.join(PROJECTS_DIR, slug)).mtimeMs;
    } catch {
      // missing entry — skip in fingerprint
    }
  }
  if (cachedResult && fp === cachedFingerprint) return cachedResult;

  const projects = new Map<string, ProjectAcc>();
  const toolCounts = new Map<string, number>();
  // mcpServer → { totalCalls, distinct tool names }
  const mcpServers = new Map<string, { calls: number; tools: Set<string> }>();

  for (const slug of entries) {
    const projDir = path.join(PROJECTS_DIR, slug);
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
      ingestFile(raw, slug, projects, toolCounts, mcpServers);
    }
  }

  const result = finalise(projects, toolCounts, mcpServers);
  cachedFingerprint = fp;
  cachedResult = result;
  return result;
}

/** Reset the memo. Tests and forced refresh paths call this. */
export function resetProjectStatsCache(): void {
  cachedFingerprint = -1;
  cachedResult = null;
}

function ingestFile(
  raw: string,
  slug: string,
  projects: Map<string, ProjectAcc>,
  toolCounts: Map<string, number>,
  mcpServers: Map<string, { calls: number; tools: Set<string> }>,
): void {
  let acc = projects.get(slug);
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
    projects.set(slug, acc);
  }

  for (const line of raw.split("\n")) {
    if (!line) continue;
    let entry: JsonlEntry;
    try {
      entry = JSON.parse(line) as JsonlEntry;
    } catch {
      continue;
    }

    // Resolve display path from the first cwd-bearing entry. Later
    // entries can't disagree meaningfully — Claude rewrites the project
    // dir if cwd changes, so all lines in one slug share a cwd.
    if (acc.path === slug && typeof entry.cwd === "string" && entry.cwd) {
      acc.path = entry.cwd;
    }

    if (typeof entry.sessionId === "string" && entry.sessionId) {
      acc.sessions.add(entry.sessionId);
    }

    const date = isoLocalDate(entry.timestamp);
    if (date && date > acc.lastActiveDate) acc.lastActiveDate = date;

    if (entry.type === "user" && !entry.isSidechain) acc.messages++;

    if (entry.type === "assistant" && entry.message) {
      const usage = entry.message.usage;
      const model = entry.message.model;
      if (usage && typeof model === "string") {
        bump(acc.inputByModel, model, numOr0(usage.input_tokens));
        bump(acc.outputByModel, model, numOr0(usage.output_tokens));
        bump(acc.cacheReadByModel, model, numOr0(usage.cache_read_input_tokens));
        bump(
          acc.cacheCreationByModel,
          model,
          numOr0(usage.cache_creation_input_tokens),
        );
      }
      const content = entry.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block &&
            typeof block === "object" &&
            (block as { type?: string }).type === "tool_use"
          ) {
            const name = (block as { name?: string }).name ?? "";
            if (!name) continue;
            toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
            const mcp = parseMcpTool(name);
            if (mcp) {
              let s = mcpServers.get(mcp.server);
              if (!s) {
                s = { calls: 0, tools: new Set() };
                mcpServers.set(mcp.server, s);
              }
              s.calls++;
              s.tools.add(mcp.tool);
            }
          }
        }
      }
    }
  }
}

function finalise(
  projects: Map<string, ProjectAcc>,
  toolCounts: Map<string, number>,
  mcpServers: Map<string, { calls: number; tools: Set<string> }>,
): ProjectBreakdown {
  const byProject: ProjectStats[] = [];
  for (const acc of projects.values()) {
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
      costUsd += computeModelCost(model, { input, output, cacheRead, cacheWrite });
    }
    // Empty projects (no sessions, no tokens) shouldn't reach the UI —
    // they accumulate when a slug exists but every JSONL was deleted.
    if (acc.sessions.size === 0 && inputTotal + outputTotal === 0) continue;
    byProject.push({
      path: acc.path,
      slug: acc.slug,
      sessions: acc.sessions.size,
      messages: acc.messages,
      tokens: inputTotal + outputTotal,
      costUsd,
      lastActiveDate: acc.lastActiveDate,
    });
  }
  byProject.sort((a, b) => b.tokens - a.tokens);

  const byTool: ToolStats[] = [...toolCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const byMcpServer: McpServerUsage[] = [...mcpServers.entries()]
    .map(([server, v]) => ({
      server,
      toolCount: v.calls,
      uniqueTools: v.tools.size,
    }))
    .sort((a, b) => b.toolCount - a.toolCount);

  return { byProject, byTool, byMcpServer };
}

/**
 * Parse the `mcp__<server>__<tool>` tool-name convention. Returns null
 * for tools that don't match — built-in tools (Read, Bash, …) shouldn't
 * be attributed to any MCP server.
 */
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

function isoLocalDate(iso: string | undefined): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyBreakdown(): ProjectBreakdown {
  return { byProject: [], byTool: [], byMcpServer: [] };
}
