/**
 * Brain importer — unpacks a `.claudebrain.zip` written by exporter.ts
 * back onto disk. Conflicts are resolved by writing the incoming file
 * to a sibling with `.imported` appended to the extension so the
 * existing file stays intact and the user can diff/merge manually.
 *
 * Merging mcpServers.json is special-cased: incoming `mcpServers`
 * entries are added to the live `~/.claude.json` alongside existing
 * entries rather than replacing the file wholesale. Losing the
 * oauthAccount + userID + projects blocks would brick the CLI.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CLAUDE_DIR } from "../../core/config";
import { readZip, type ZipEntry } from "./zip";
import type { BrainManifest } from "./exporter";

export interface ImportSummary {
  /** Files written at their natural destination (no conflict). */
  written: string[];
  /** Files that would have overwritten existing content; saved as `.imported`. */
  deferredAsImported: string[];
  /** Files in the archive we refused to restore (e.g. out-of-tree paths). */
  skipped: string[];
  /** mcpServers entries merged into ~/.claude.json. */
  mergedMcpServers: string[];
  /** Human-readable warnings to surface in the post-import toast. */
  warnings: string[];
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

/** Suffix path with `.imported` before the extension. */
function importedSibling(absPath: string): string {
  const ext = path.extname(absPath);
  const base = absPath.slice(0, absPath.length - ext.length);
  return `${base}.imported${ext}`;
}

/**
 * Write a file, creating parent directories. When the destination
 * exists and content differs, write to `.imported` sibling instead.
 * Returns one of: "written", "deferred", "skipped".
 */
function writeFileConflictAware(
  absPath: string,
  data: Buffer,
  summary: ImportSummary,
): "written" | "deferred" {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  if (fs.existsSync(absPath)) {
    // Compare content — don't bother writing .imported siblings when
    // the incoming data is byte-identical to what's already there.
    try {
      const existing = fs.readFileSync(absPath);
      if (existing.equals(data)) {
        summary.written.push(absPath);
        return "written";
      }
    } catch {
      // unreadable — treat as conflict
    }
    const sibling = importedSibling(absPath);
    fs.writeFileSync(sibling, data);
    summary.deferredAsImported.push(sibling);
    return "deferred";
  }
  fs.writeFileSync(absPath, data);
  summary.written.push(absPath);
  return "written";
}

/** Merge incoming mcpServers entries into ~/.claude.json. */
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
    if (!(name in merged)) {
      merged[name] = cfg;
      summary.mergedMcpServers.push(name);
    }
    // else: keep the live entry; incoming goes to skipped to surface
    // that the user still has two choices.
    else summary.skipped.push(`mcpServers.${name} (already exists)`);
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
    deferredAsImported: [],
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
      writeFileConflictAware(abs, entry.data, summary);
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
      writeFileConflictAware(abs, entry.data, summary);
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
