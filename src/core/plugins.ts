/**
 * Plugin discovery — enumerates Claude Code plugins installed under
 * `~/.claude/plugins/` and resolves their content directories (skills,
 * agents, commands, hooks, mcp servers).
 *
 * Claude Code plugins live in
 *   `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`
 * and are catalogued in `~/.claude/plugins/installed_plugins.json`.
 * Each plugin's content is described by `.claude-plugin/plugin.json`,
 * which may declare custom subdirectory paths or inline `hooks`/
 * `mcpServers` blocks.
 *
 * Plugins synced from the signed-in claude.ai account are a second source:
 * they live under `~/.claude/plugins/synced/<bucket>/` (see claudeAiSync.ts)
 * and are NOT recorded in installed_plugins.json. Claude Code identifies them
 * as `<name>@synced`; they are read-only here.
 *
 * Pure Node.js file I/O — no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import { activeSyncedDir, SYNCED_DIR_NAME, syncedDirName } from "./claudeAiSync";
import { type ManagedLookup, managedOnce } from "./managedSettings";
import { CLAUDE_DIR, SETTINGS_FILE, claudeSettingsPath } from "./config";
import { asObject, readJsonObject } from "./jsonFile";
import { createMtimeCache } from "./mtimeCache";

/** Install scope as recorded in `installed_plugins.json`. */
export type PluginInstallScope = "user" | "project";

/** Subset of a Claude Code plugin manifest that we care about. */
export interface PluginManifest {
  name?: string;
  description?: string;
  version?: string;
  /**
   * Path (relative to plugin root) or list of paths to the skills
   * directory. When omitted, `skills/` is tried by convention.
   */
  skills?: string | string[];
  /** Same shape as `skills`; default `agents/`. */
  agents?: string | string[];
  /** Same shape as `skills`; default `commands/`. */
  commands?: string | string[];
  /**
   * Inline hooks block — same structure as the `hooks` field in
   * `settings.json` (event → entry[]). Plugins always declare hooks
   * inline; there is no convention for a separate hooks file.
   */
  hooks?: Record<string, unknown>;
  /**
   * Inline MCP server block, same structure as `.mcp.json`'s
   * `mcpServers` field. When absent, the plugin root is searched
   * for `.mcp.json` then `mcp.json`.
   */
  mcpServers?: Record<string, unknown>;
}

/** A plugin that is installed and active for the current context. */
export interface ActivePlugin {
  /** Plugin name (the part before `@` in the installed_plugins.json key). */
  name: string;
  /** Marketplace name (the part after `@`). */
  marketplace: string;
  /** Composite key from installed_plugins.json (`<name>@<marketplace>`). */
  qualifiedName: string;
  /** Absolute path to the plugin's root directory (the version dir). */
  installPath: string;
  /** Whether this plugin is enabled at user scope or only for a project. */
  installScope: PluginInstallScope;
  /** Parsed `.claude-plugin/plugin.json`, or `{}` when missing/invalid. */
  manifest: PluginManifest;
  /**
   * Synced from the signed-in claude.ai account (`marketplace` is then
   * {@link SYNCED_MARKETPLACE}). Its files are replaced on every sync round
   * and edits are never sent back, so everything it provides is read-only.
   */
  synced?: true;
}

/**
 * Marketplace half of a synced plugin's id. Claude Code's own sentinel:
 * `"name@synced"` for plugins synced from claude.ai.
 */
export const SYNCED_MARKETPLACE = "synced";

/** Plugin root directory (`~/.claude/plugins/`). */
const PLUGINS_ROOT: string = path.join(CLAUDE_DIR, "plugins");
const SYNCED_PLUGINS_ROOT: string = path.join(PLUGINS_ROOT, SYNCED_DIR_NAME);
const INSTALLED_PLUGINS_FILE: string = path.join(PLUGINS_ROOT, "installed_plugins.json");
const BLOCKLIST_FILE: string = path.join(PLUGINS_ROOT, "blocklist.json");

/** Manifest cache keyed by absolute path to plugin.json. */
const manifestCache = createMtimeCache<PluginManifest>();

/**
 * Normalise a filesystem path for cross-platform equality compare.
 * Lowercases and switches all separators to `/`. On POSIX the
 * lowercase pass is a no-op for case-sensitive filesystems but is
 * harmless for the comparison use case (we never write back).
 */
function normalisePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

interface RawInstalledEntry {
  scope?: unknown;
  projectPath?: unknown;
  installPath?: unknown;
}

interface RawBlocklistEntry {
  plugin?: unknown;
}

/**
 * Parse `installed_plugins.json`. Returns an empty object on missing
 * file, malformed JSON, or unexpected shape.
 */
function readInstalledPluginsFile(): Record<string, RawInstalledEntry[]> {
  let raw: string;
  try {
    raw = fs.readFileSync(INSTALLED_PLUGINS_FILE, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(
        `[claude-manager] Failed to read ${INSTALLED_PLUGINS_FILE}:`,
        (err as Error).message,
      );
    }
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    console.warn(
      `[claude-manager] Failed to parse ${INSTALLED_PLUGINS_FILE}:`,
      (err as Error).message,
    );
    return {};
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const plugins = (parsed as { plugins?: unknown }).plugins;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) return {};

  const out: Record<string, RawInstalledEntry[]> = {};
  for (const [key, entries] of Object.entries(plugins as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    out[key] = entries.filter((e): e is RawInstalledEntry =>
      Boolean(e) && typeof e === "object" && !Array.isArray(e),
    );
  }
  return out;
}

/** Read `blocklist.json` and return the set of blocked qualified names. */
function readBlocklist(): Set<string> {
  const blocked = new Set<string>();
  let raw: string;
  try {
    raw = fs.readFileSync(BLOCKLIST_FILE, "utf-8");
  } catch {
    return blocked;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return blocked;
  }
  const list = (parsed as { plugins?: unknown })?.plugins;
  if (!Array.isArray(list)) return blocked;
  for (const entry of list) {
    const qn = (entry as RawBlocklistEntry).plugin;
    if (typeof qn === "string") blocked.add(qn);
  }
  return blocked;
}

/**
 * Split the `<name>@<marketplace>` key from installed_plugins.json.
 * Splits on the LAST `@` so plugin names containing `@` survive.
 */
function splitQualifiedName(qualifiedName: string): { name: string; marketplace: string } {
  const at = qualifiedName.lastIndexOf("@");
  if (at <= 0) return { name: qualifiedName, marketplace: "" };
  return {
    name: qualifiedName.slice(0, at),
    marketplace: qualifiedName.slice(at + 1),
  };
}

/** Read and cache the manifest at `<plugin>/.claude-plugin/plugin.json`. */
function readManifest(installPath: string): PluginManifest {
  const manifestPath = path.join(installPath, ".claude-plugin", "plugin.json");
  try {
    return manifestCache.get(manifestPath, (p) => {
      let raw: string;
      try {
        raw = fs.readFileSync(p, "utf-8");
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn(
            `[claude-manager] Failed to read plugin manifest ${p}:`,
            (err as Error).message,
          );
        }
        return {};
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return parsed as PluginManifest;
      } catch (err: unknown) {
        console.warn(
          `[claude-manager] Failed to parse plugin manifest ${p}:`,
          (err as Error).message,
        );
        return {};
      }
    });
  } catch {
    return {};
  }
}

/**
 * Normalise one `enabledPlugins` value to a boolean.
 *
 * The schema is `Record<string, string[] | boolean | object>`: besides the
 * plain boolean, Claude Code accepts an "extended format with version
 * constraints". Any non-boolean form is a way of saying "load this one,
 * pinned" — so it reads as enabled unless it carries an explicit
 * `enabled: false`. Returns null for a value that means nothing at all, so
 * the caller can drop the entry instead of inventing a decision for it.
 */
export function normaliseEnabledValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return true;
  const obj = asObject(value);
  if (obj) return typeof obj.enabled === "boolean" ? obj.enabled : true;
  return null;
}

/**
 * Plugin ids that settings turn on in this context: `enabledPlugins` merged
 * per id across user < project < local < managed settings, the highest
 * scope that mentions an id deciding it.
 */
export function enabledPluginIds(
  workspacePath?: string,
  managed: ManagedLookup = managedOnce(),
): Set<string> {
  const maps: unknown[] = [];
  for (const file of [
    SETTINGS_FILE,
    workspacePath ? claudeSettingsPath("project", workspacePath) : null,
    workspacePath ? claudeSettingsPath("local", workspacePath) : null,
  ]) {
    if (file === null) continue;
    const res = readJsonObject(file);
    if (res.kind === "ok") maps.push(res.data.enabledPlugins);
  }
  maps.push(managed()?.enabledPlugins);

  const decided = new Map<string, boolean>();
  for (const map of maps) {
    for (const [id, value] of Object.entries(asObject(map) ?? {})) {
      const enabled = normaliseEnabledValue(value);
      if (enabled !== null) decided.set(id, enabled);
    }
  }
  return new Set([...decided].filter(([, on]) => on).map(([id]) => id));
}

/**
 * Plugins synced from the active claude.ai account, from its bucket's
 * `manifest.json` (`{ plugins: [{ name, generation?, … }] }`).
 *
 * A synced plugin whose name matches a local plugin that is ENABLED is
 * skipped: Claude Code reports it as "synced-plugin-shadowed" — the copy on
 * this machine "has the same name and takes precedence". The CLI only
 * collects local copies with `enabled !== false` for that check, so an
 * installed-but-off local plugin leaves the synced one loaded.
 */
function loadSyncedPlugins(
  local: ActivePlugin[],
  workspacePath: string | undefined,
  managed: ManagedLookup,
): ActivePlugin[] {
  const bucket = activeSyncedDir(SYNCED_PLUGINS_ROOT, "plugins", managed);
  if (bucket === null) return [];
  // Settings are only read when there is something to shadow.
  const enabled = local.length > 0 ? enabledPluginIds(workspacePath, managed) : new Set<string>();
  const localNames = new Set(
    local.filter((p) => enabled.has(p.qualifiedName)).map((p) => p.name.toLowerCase()),
  );
  const res = readJsonObject(path.join(bucket, "manifest.json"));
  const rows = res.kind === "ok" && Array.isArray(res.data.plugins) ? res.data.plugins : [];

  const out: ActivePlugin[] = [];
  for (const row of rows) {
    const entry = asObject(row);
    const name = typeof entry?.name === "string" ? entry.name : "";
    if (name === "" || localNames.has(name.toLowerCase())) continue;
    const dirName = syncedDirName(name, entry?.generation);
    if (dirName === null) continue;
    const installPath = path.join(bucket, dirName);
    // Listed but not downloaded yet (or removed mid-round): not loaded.
    try {
      if (!fs.statSync(installPath).isDirectory()) continue;
    } catch {
      continue;
    }
    out.push({
      name,
      marketplace: SYNCED_MARKETPLACE,
      qualifiedName: `${name}@${SYNCED_MARKETPLACE}`,
      installPath,
      installScope: "user",
      manifest: readManifest(installPath),
      synced: true,
    });
  }
  return out;
}

/**
 * Discover plugins that should be active for the current context.
 *
 * - `user`-scope plugins are always active.
 * - `project`-scope plugins are active only when their recorded
 *   `projectPath` matches the supplied `workspacePath` (case- and
 *   separator-insensitive — required for Windows).
 *
 * Plugins listed in `blocklist.json`, missing on disk, or with
 * unparseable entries are silently skipped. Multiple entries for the
 * same plugin (same `installPath`) are deduplicated. Plugins synced from
 * the active claude.ai account follow the installed ones. `managed` lets a
 * caller that already read the policy tier this pass share that read.
 */
export function loadActivePlugins(
  workspacePath?: string,
  managed: ManagedLookup = managedOnce(),
): ActivePlugin[] {
  const installed = readInstalledPluginsFile();

  const blocked = readBlocklist();
  const wsNorm = workspacePath ? normalisePath(workspacePath) : undefined;

  const byInstallPath = new Map<string, ActivePlugin>();

  for (const [qualifiedName, entries] of Object.entries(installed)) {
    if (blocked.has(qualifiedName)) continue;
    const { name, marketplace } = splitQualifiedName(qualifiedName);

    for (const entry of entries) {
      const installPath = typeof entry.installPath === "string" ? entry.installPath : undefined;
      if (!installPath) continue;

      const installScope: PluginInstallScope =
        entry.scope === "project" ? "project" : entry.scope === "user" ? "user" : "user";

      if (installScope === "project") {
        if (!wsNorm) continue;
        const projectPath = typeof entry.projectPath === "string" ? entry.projectPath : undefined;
        if (!projectPath) continue;
        if (normalisePath(projectPath) !== wsNorm) continue;
      }

      // Verify on disk before recording — stale registry entries
      // (deleted/uninstalled cache dirs) would otherwise surface as
      // ghost plugins.
      try {
        if (!fs.statSync(installPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const key = normalisePath(installPath);
      if (byInstallPath.has(key)) continue;

      byInstallPath.set(key, {
        name,
        marketplace,
        qualifiedName,
        installPath,
        installScope,
        manifest: readManifest(installPath),
      });
    }
  }

  // Stable ordering by qualified name keeps webview lists deterministic.
  const local = [...byInstallPath.values()].sort((a, b) =>
    a.qualifiedName.localeCompare(b.qualifiedName),
  );
  const synced = loadSyncedPlugins(local, workspacePath, managed);
  return [...local, ...synced];
}

/**
 * Resolve content directories declared by a plugin for one of the
 * path-style fields (`skills` / `agents` / `commands`).
 *
 * The manifest field may be:
 *   - omitted        → fall back to the conventional dir (`skills/`)
 *   - a string       → single relative path
 *   - a string array → multiple relative paths
 *
 * Paths are resolved against the plugin root and validated to stay
 * within it (no `..` escape, no absolute paths). Non-existent dirs
 * are filtered out. The default convention dir is only added when
 * it exists on disk so plugins that only ship one content type
 * don't contribute empty placeholder paths.
 */
export function resolvePluginContentDirs(
  plugin: ActivePlugin,
  field: "skills" | "agents" | "commands",
  defaultDir: string,
): string[] {
  const declared = plugin.manifest[field];
  const candidates: string[] = [];

  if (typeof declared === "string") {
    candidates.push(declared);
  } else if (Array.isArray(declared)) {
    for (const item of declared) if (typeof item === "string") candidates.push(item);
  } else {
    // No declaration — fall back to convention.
    candidates.push(defaultDir);
  }

  const resolved: string[] = [];
  const rootNorm = normalisePath(plugin.installPath);
  for (const rel of candidates) {
    // Reject absolute paths and any segment that resolves outside
    // the plugin root.
    if (path.isAbsolute(rel)) continue;
    const abs = path.resolve(plugin.installPath, rel);
    if (!normalisePath(abs).startsWith(`${rootNorm}/`) && normalisePath(abs) !== rootNorm) continue;
    try {
      if (!fs.statSync(abs).isDirectory()) continue;
    } catch {
      continue;
    }
    resolved.push(abs);
  }
  return resolved;
}

/**
 * Locate a plugin's MCP server config file. Returns the first of
 * `.mcp.json` then `mcp.json` that exists at the plugin root, or
 * `undefined` when the plugin declares MCP only inline (or not at
 * all).
 */
export function findPluginMcpFile(plugin: ActivePlugin): string | undefined {
  for (const name of [".mcp.json", "mcp.json"]) {
    const candidate = path.join(plugin.installPath, name);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // continue
    }
  }
  return undefined;
}
