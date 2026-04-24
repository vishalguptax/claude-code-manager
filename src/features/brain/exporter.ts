/**
 * Brain exporter — walks the user's Claude config + memory surfaces
 * and packages them into a single `.claudebrain.zip`. Session data,
 * OAuth credentials, and Claude-Manager's own profile snapshots are
 * explicitly excluded — the "brain" is config + learned behavior,
 * not identity or history.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CLAUDE_DIR } from "../../core/config";
import { writeZip, type ZipEntry } from "./zip";

export type BrainScope = "global" | "project" | "both";

export interface BrainManifest {
  version: 1;
  exportedAt: string;
  sections: Array<"global" | "project">;
  sourceWorkspace: string;
  sourcePlatform: NodeJS.Platform;
}

/**
 * Top-level entries inside the user's home that constitute the
 * "global brain" — files and directories we pull into the archive
 * when `scope` includes `global`.
 */
const GLOBAL_FILES: string[] = [
  "CLAUDE.md",
  "settings.json",
];
const GLOBAL_DIRS: string[] = [
  "skills",
  "commands",
  "agents",
  "memory",
];

/**
 * Project (workspace) surfaces. All paths are relative to the
 * workspace root.
 */
const PROJECT_FILES: string[] = [
  "CLAUDE.md",
  ".mcp.json",
  ".claude/CLAUDE.md",
  ".claude/settings.json",
  ".claude/settings.local.json",
];
const PROJECT_DIRS: string[] = [
  ".claude/skills",
  ".claude/commands",
  ".claude/agents",
  ".claude/memory",
];

/** Recursively walk a directory, pushing each file's absolute path to `out`. */
function walkFiles(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
}

/**
 * Read the `mcpServers` block from `~/.claude.json` — nothing else.
 * oauthAccount, userID, `projects`, caches, etc. are all identity or
 * machine-specific state and should NOT end up in a shared brain.
 */
function readGlobalMcpServers(): string | null {
  const claudeJson = path.join(os.homedir(), ".claude.json");
  try {
    const raw = fs.readFileSync(claudeJson, "utf-8");
    const parsed = JSON.parse(raw) as { mcpServers?: unknown };
    if (!parsed.mcpServers) return null;
    return JSON.stringify({ mcpServers: parsed.mcpServers }, null, 2);
  } catch {
    return null;
  }
}

function addFile(entries: ZipEntry[], archivePath: string, absPath: string): void {
  try {
    const data = fs.readFileSync(absPath);
    entries.push({ path: archivePath, data });
  } catch {
    // Missing file — skip silently; manifest still reflects what was
    // attempted.
  }
}

/** Build the archive buffer for the given scope. */
export function exportBrain(scope: BrainScope, workspacePath?: string): Buffer {
  const entries: ZipEntry[] = [];
  const sections: Array<"global" | "project"> = [];

  if (scope === "global" || scope === "both") {
    sections.push("global");
    for (const f of GLOBAL_FILES) {
      addFile(entries, `global/${f}`, path.join(CLAUDE_DIR, f));
    }
    for (const d of GLOBAL_DIRS) {
      const dirAbs = path.join(CLAUDE_DIR, d);
      const files: string[] = [];
      walkFiles(dirAbs, files);
      for (const f of files) {
        const rel = path.relative(CLAUDE_DIR, f).split(path.sep).join("/");
        addFile(entries, `global/${rel}`, f);
      }
    }
    const mcp = readGlobalMcpServers();
    if (mcp) {
      entries.push({
        path: "global/mcpServers.json",
        data: Buffer.from(mcp, "utf-8"),
      });
    }
  }

  if ((scope === "project" || scope === "both") && workspacePath) {
    sections.push("project");
    for (const f of PROJECT_FILES) {
      addFile(entries, `project/${f}`, path.join(workspacePath, f));
    }
    for (const d of PROJECT_DIRS) {
      const dirAbs = path.join(workspacePath, d);
      const files: string[] = [];
      walkFiles(dirAbs, files);
      for (const f of files) {
        const rel = path.relative(workspacePath, f).split(path.sep).join("/");
        addFile(entries, `project/${rel}`, f);
      }
    }
  }

  // Manifest — version + sections + origin metadata. Consumers (our
  // importer, but also humans inspecting the archive) can tell at a
  // glance what's inside without walking every entry.
  const manifest: BrainManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sections,
    sourceWorkspace: workspacePath ? path.basename(workspacePath) : "",
    sourcePlatform: process.platform,
  };
  entries.push({
    path: "brain-manifest.json",
    data: Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"),
  });

  return writeZip(entries);
}
