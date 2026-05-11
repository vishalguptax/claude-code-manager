/**
 * Brain importer — unpacks a `.claudebrain.zip` written by exporter.ts
 * back onto disk. Caller confirms the destructive replace; existing
 * files at conflicting paths are overwritten.
 *
 * Merging mcpServers entries is still special-cased: they're written
 * back into the live `~/.claude.json` (not into a standalone file) so
 * the surrounding oauthAccount + userID + projects blocks survive.
 * Incoming entries replace same-named existing entries.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CLAUDE_DIR } from "../../core/config";
import { readZip, type ZipEntry } from "./zip";
import type { BrainManifest } from "./exporter";

export interface ImportSummary {
  /** Files written to a path that didn't exist before. */
  written: string[];
  /** Existing files whose contents were replaced by the incoming version. */
  overwritten: string[];
  /** Files in the archive we refused to restore (e.g. out-of-tree paths). */
  skipped: string[];
  /** mcpServers entry names written into ~/.claude.json (new or replaced). */
  mergedMcpServers: string[];
  /** Human-readable warnings to surface in the post-import toast. */
  warnings: string[];
}

export interface ConflictPreview {
  /** Destination paths that already exist and will be overwritten. */
  overwrites: string[];
  /** mcpServers entry names already present in ~/.claude.json. */
  mcpReplacements: string[];
}

/**
 * Guard against path-traversal: incoming paths like `../../etc/passwd`
 * must never write outside the target root. Returns the joined
 * absolute path when safe, or null when the path escapes.
 */
function safeJoin(root: string, rel: string): string | null {
  const joined = path.resolve(root, rel);
  const rootResolved = path.resolve(root) + path.sep;
  if (joined === path.resolve(root)) return null;
  if (!(joined + path.sep).startsWith(rootResolved)) return null;
  return joined;
}

/**
 * Write a file, creating parent directories. Overwrites existing
 * content when the bytes differ; skips the write when identical so
 * mtimes stay stable.
 */
function writeFileReplacing(
  absPath: string,
  data: Buffer,
  summary: ImportSummary,
): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const existed = fs.existsSync(absPath);
  if (existed) {
    try {
      const existing = fs.readFileSync(absPath);
      if (existing.equals(data)) {
        summary.written.push(absPath);
        return;
      }
    } catch {
      // unreadable — fall through and overwrite
    }
    fs.writeFileSync(absPath, data);
    summary.overwritten.push(absPath);
    return;
  }
  fs.writeFileSync(absPath, data);
  summary.written.push(absPath);
}

/** Merge incoming mcpServers entries into ~/.claude.json, replacing same-named entries. */
function mergeMcpServers(raw: string, summary: ImportSummary): void {
  let incoming: { mcpServers?: Record<string, unknown> };
  try {
    incoming = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
  } catch {
    summary.skipped.push("mcpServers (unparseable)");
    return;
  }
  if (!incoming.mcpServers) return;

  const target = path.join(os.homedir(), ".claude.json");
  let live: Record<string, unknown> = {};
  try {
    const liveRaw = fs.readFileSync(target, "utf-8");
    if (liveRaw.trim()) live = JSON.parse(liveRaw) as Record<string, unknown>;
  } catch {
    // empty/corrupt — start from empty object
  }

  const existingServers = (live.mcpServers as Record<string, unknown>) ?? {};
  const merged: Record<string, unknown> = { ...existingServers };
  for (const [name, cfg] of Object.entries(incoming.mcpServers)) {
    merged[name] = cfg;
    summary.mergedMcpServers.push(name);
  }
  live.mcpServers = merged;
  fs.writeFileSync(target, JSON.stringify(live, null, 2));
}

export function importBrain(
  zipBuf: Buffer,
  workspacePath: string | undefined,
  pickSections: Array<"global" | "project">,
): ImportSummary {
  const summary: ImportSummary = {
    written: [],
    overwritten: [],
    skipped: [],
    mergedMcpServers: [],
    warnings: [],
  };

  const entries = readZip(zipBuf);
  const manifestEntry = entries.find((e) => e.path === "brain-manifest.json");
  let manifest: BrainManifest | null = null;
  if (manifestEntry) {
    try {
      manifest = JSON.parse(manifestEntry.data.toString("utf-8")) as BrainManifest;
    } catch {
      // ignore; sections derive from entry prefixes below
    }
  }

  for (const entry of entries) {
    if (entry.path === "brain-manifest.json") continue;

    let section: "global" | "project" | null = null;
    let relative = "";
    if (entry.path.startsWith("global/")) {
      section = "global";
      relative = entry.path.slice("global/".length);
    } else if (entry.path.startsWith("project/")) {
      section = "project";
      relative = entry.path.slice("project/".length);
    } else {
      summary.skipped.push(entry.path);
      continue;
    }
    if (!pickSections.includes(section)) continue;

    if (section === "global") {
      // Special-case mcpServers.json — merge instead of overwriting
      // the live ~/.claude.json contents.
      if (relative === "mcpServers.json") {
        mergeMcpServers(entry.data.toString("utf-8"), summary);
        continue;
      }
      const abs = safeJoin(CLAUDE_DIR, relative);
      if (!abs) {
        summary.skipped.push(entry.path);
        continue;
      }
      writeFileReplacing(abs, entry.data, summary);
      // settings.json from another machine often contains hooks
      // whose `command` begins with an absolute path only valid on
      // the source machine. Warn on import so users can fix them
      // before the next Claude session tries to run a missing
      // binary.
      if (relative === "settings.json") {
        const sourceWarnings = checkSettingsHookPaths(entry.data.toString("utf-8"));
        summary.warnings.push(...sourceWarnings);
      }
    } else if (section === "project") {
      if (!workspacePath) {
        summary.skipped.push(entry.path);
        continue;
      }
      const abs = safeJoin(workspacePath, relative);
      if (!abs) {
        summary.skipped.push(entry.path);
        continue;
      }
      writeFileReplacing(abs, entry.data, summary);
      if (relative === ".claude/settings.json") {
        const sourceWarnings = checkSettingsHookPaths(entry.data.toString("utf-8"));
        summary.warnings.push(...sourceWarnings);
      }
    }
  }

  return summary;
}

/**
 * Inspect a settings.json blob for hooks whose `command` field starts
 * with an absolute path. Any such path that doesn't exist on the
 * importing machine becomes a warning in the summary, since the
 * Claude CLI would otherwise silently fail the hook at runtime with
 * ENOENT. Relative commands (`node script.js`) and plain shell words
 * (`echo hello`) are assumed fine — they resolve via $PATH.
 */
function checkSettingsHookPaths(raw: string): string[] {
  const warnings: string[] = [];
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return warnings;
  }
  const hooks = parsed.hooks as Record<string, unknown> | undefined;
  if (!hooks || typeof hooks !== "object") return warnings;

  for (const [eventName, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      const inner = (matcher as { hooks?: unknown }).hooks;
      if (!Array.isArray(inner)) continue;
      for (const hook of inner) {
        const command = (hook as { command?: unknown }).command;
        if (typeof command !== "string" || !command.trim()) continue;
        // First token = the executable. Tokenise on whitespace (shell
        // quoting not unrolled; safe upper bound for the check).
        const first = command.trim().split(/\s+/)[0] ?? "";
        if (!path.isAbsolute(first)) continue;
        if (!fs.existsSync(first)) {
          warnings.push(
            `Hook in ${eventName} references missing path: ${first}`,
          );
        }
      }
    }
  }
  return warnings;
}

/**
 * Dry-run the import to enumerate what would be overwritten. Caller
 * uses this to build a precise confirmation dialog before the
 * destructive write. Pure read — no filesystem mutation.
 */
export function previewConflicts(
  zipBuf: Buffer,
  workspacePath: string | undefined,
  pickSections: Array<"global" | "project">,
): ConflictPreview {
  const overwrites: string[] = [];
  const mcpReplacements: string[] = [];
  let entries: ZipEntry[];
  try {
    entries = readZip(zipBuf);
  } catch {
    return { overwrites, mcpReplacements };
  }

  for (const entry of entries) {
    if (entry.path === "brain-manifest.json") continue;

    let section: "global" | "project" | null = null;
    let relative = "";
    if (entry.path.startsWith("global/")) {
      section = "global";
      relative = entry.path.slice("global/".length);
    } else if (entry.path.startsWith("project/")) {
      section = "project";
      relative = entry.path.slice("project/".length);
    } else {
      continue;
    }
    if (!pickSections.includes(section)) continue;

    if (section === "global" && relative === "mcpServers.json") {
      try {
        const incoming = JSON.parse(entry.data.toString("utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        if (!incoming.mcpServers) continue;
        const target = path.join(os.homedir(), ".claude.json");
        let live: Record<string, unknown> = {};
        try {
          const raw = fs.readFileSync(target, "utf-8");
          if (raw.trim()) live = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          // no live file — nothing to replace
        }
        const existing = (live.mcpServers as Record<string, unknown>) ?? {};
        for (const name of Object.keys(incoming.mcpServers)) {
          if (name in existing) mcpReplacements.push(name);
        }
      } catch {
        // unparseable — importer will surface as skipped
      }
      continue;
    }

    const root = section === "global" ? CLAUDE_DIR : workspacePath;
    if (!root) continue;
    const abs = safeJoin(root, relative);
    if (!abs) continue;
    if (!fs.existsSync(abs)) continue;
    try {
      const existing = fs.readFileSync(abs);
      if (existing.equals(entry.data)) continue;
    } catch {
      // unreadable — count as overwrite candidate
    }
    overwrites.push(abs);
  }
  return { overwrites, mcpReplacements };
}

/** Expose just the manifest for pre-import UI (scope picker). */
export function readManifest(zipBuf: Buffer): BrainManifest | null {
  try {
    const entries = readZip(zipBuf);
    const m = entries.find((e) => e.path === "brain-manifest.json");
    if (!m) return null;
    return JSON.parse(m.data.toString("utf-8")) as BrainManifest;
  } catch {
    return null;
  }
}
