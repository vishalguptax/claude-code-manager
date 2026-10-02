/**
 * MCP server parsing — reads MCP server configurations from the project's
 * .mcp.json, ~/.claude.json (user servers at the top level, local servers and
 * the `/mcp` toggles under the workspace's `projects` entry), the legacy
 * ~/.claude/mcp.json, and installed plugins.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import {
  CLAUDE_DIR,
  CLAUDE_JSON_FILE,
  MCP_AUTH_CACHE_FILE,
  canonicalPath,
  claudeSettingsPath,
} from "../../core/config";
import { describeReadRefusal, readJsonObjectForWrite, writeFileAtomic } from "../../core/atomicWrite";
import { createMtimeCache } from "../../core/mtimeCache";
import { withLocks, CONFIG_LOCK, type LockFailure } from "../../core/claudeLocks";
import { loadActivePlugins, findPluginMcpFile, type ActivePlugin } from "../../core/plugins";
import type { McpServerInput } from "../../shared/protocol/messages";
import { claudeCwd, claudeProjectKey } from "./projectKey";
import type { McpServer, McpServerScope, McpServerType } from "./types";

/** Servers parsed from every scope, plus any per-file parse failures. */
export interface McpParseResult {
  servers: McpServer[];
  errors: string[];
}

interface FileParseResult {
  servers: McpServer[];
  /** User-readable failure, naming the file, when the read/parse failed. */
  error?: string;
}

/**
 * Cache `FileParseResult` keyed by config file path. Caching the error
 * alongside the servers means a malformed file keeps reporting its
 * error without being re-read on every call.
 */
const mcpCache = createMtimeCache<FileParseResult>();

/**
 * Canonical global/user MCP config. Claude Code stores `claude mcp add -s user`
 * servers in ~/.claude.json under a top-level `mcpServers` key — this is where
 * real global servers actually live. (It does NOT use ~/.claude/mcp.json.)
 */

/**
 * The `.mcp.json` files Claude Code merges into project scope, farthest
 * first: one in the session's cwd and in every ancestor of it, up to but not
 * including the filesystem root — past the repo root and home alike. Merged
 * in this order, the file nearest the workspace wins a name clash. (Checked
 * against `claude mcp list` 2.1.287 run in a repo subfolder.)
 */
function projectMcpFiles(workspacePath: string): string[] {
  const dirs: string[] = [];
  for (let dir = claudeCwd(workspacePath); dir !== path.parse(dir).root; dir = path.dirname(dir)) {
    dirs.push(dir);
  }
  return dirs.reverse().map((dir) => path.join(dir, ".mcp.json"));
}

/**
 * The `.mcp.json` that holds the project server `name` Claude Code loads —
 * the nearest file declaring it — so an edit or delete changes the entry
 * that is actually in effect. A name no file declares resolves to the
 * workspace's own `.mcp.json`, where new project servers go.
 */
export function projectMcpFileFor(name: string, workspacePath: string): string {
  const holder = projectMcpFiles(workspacePath)
    .reverse()
    .find((file) => readMcpServersFromFile(file, { scope: "project" }).servers.some((s) => s.name === name));
  return holder ?? path.join(workspacePath, ".mcp.json");
}

/** Legacy global MCP config (~/.claude/mcp.json) — read for older setups. */
const GLOBAL_MCP_FILE: string = path.join(CLAUDE_DIR, "mcp.json");

/**
 * Write an MCP config back atomically (temp + rename) so a crash can't leave
 * the file — especially the critical ~/.claude.json — truncated. Indentation
 * is matched to the original so a large minified file isn't ballooned into a
 * huge pretty-printed diff.
 */
function writeMcpConfig(filePath: string, config: unknown, originalRaw: string): boolean {
  const indented = /\n[ \t]+"/.test(originalRaw);
  const json = JSON.stringify(config, null, indented ? 2 : undefined) + (indented ? "\n" : "");
  try {
    // Create the parent dir so a first project server can be added to a
    // workspace that has no .mcp.json yet.
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve which file owns a global-scope server `name` for a write.
 * Prefer the canonical ~/.claude.json; fall back to the legacy file
 * only when the entry lives there.
 */
export function globalMcpFileFor(name: string): string {
  try {
    const cfg = JSON.parse(fs.readFileSync(CLAUDE_JSON_FILE, "utf-8")) as {
      mcpServers?: Record<string, unknown>;
    };
    if (cfg.mcpServers && name in cfg.mcpServers) return CLAUDE_JSON_FILE;
  } catch {
    // unreadable/absent — fall through to legacy
  }
  return GLOBAL_MCP_FILE;
}

/**
 * Resolve the global-scope config file to open when there is no
 * specific server name to look up (the config-level "Open Config"
 * action). Prefer the canonical ~/.claude.json when it exists; only
 * fall back to the legacy file when the canonical one is missing.
 */
export function globalMcpConfigFile(): string {
  return fs.existsSync(CLAUDE_JSON_FILE) ? CLAUDE_JSON_FILE : GLOBAL_MCP_FILE;
}

/**
 * Run a read-modify-write of `filePath`, holding Claude Code's config lock
 * when the file is ~/.claude.json. That file also carries oauthAccount,
 * per-project trust and MCP approvals, and Claude Code rewrites it whole
 * under the same lock; without taking it, our write — based on a read that
 * predates Claude Code's — would silently revert whatever it just saved.
 * `work` must do its own read so the write builds on the freshest file.
 */
function withConfigFileLock(filePath: string, work: () => McpWriteResult): McpWriteResult {
  if (filePath !== CLAUDE_JSON_FILE) return work();
  const result = withLocks([CONFIG_LOCK], work);
  return result.ok ? result.value : { ok: false, error: describeConfigLockFailure(result.failure) };
}

function describeConfigLockFailure(failure: LockFailure): string {
  return failure.reason === "busy"
    ? `Claude Code is writing ${CLAUDE_JSON_FILE} right now. Try again in a moment.`
    : `Could not coordinate with Claude Code to write ${CLAUDE_JSON_FILE} (${failure.detail}).`;
}

/** The scope (and, for plugin servers, the owning plugin) stamped on a parsed block. */
interface McpReadOpts {
  scope: McpServerScope;
  pluginName?: string;
}

/**
 * Resolve a server's transport type. An explicit `type` always wins —
 * `stdio`/`sse`/`ws` pass through verbatim (even `sse`, which Claude
 * Code deprecated but still accepts), `http`/`streamable-http` both
 * normalize to `http`. Only when `type` is absent or unrecognized do
 * we fall back to inferring from shape (a bare `url` with no
 * `command` implies `http`).
 */
function resolveServerType(
  explicitType: string | undefined,
  command: string | undefined,
  url: string | undefined,
): McpServerType {
  if (explicitType === "stdio" || explicitType === "sse" || explicitType === "ws") {
    return explicitType;
  }
  if (explicitType === "http" || explicitType === "streamable-http") {
    return "http";
  }
  return !command && url ? "http" : "stdio";
}

/** Read a plain string-valued object (env / headers), dropping non-string values. */
function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Convert the raw `mcpServers` object (whatever its source — a JSON
 * file or an inline manifest block) into McpServer[] tagged with the
 * given scope.
 */
function buildServersFromBlock(
  mcpServers: unknown,
  opts: McpReadOpts,
): McpServer[] {
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    return [];
  }
  const servers: McpServer[] = [];
  const serversMap = mcpServers as Record<string, unknown>;
  for (const [name, entry] of Object.entries(serversMap)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const rec = entry as Record<string, unknown>;
    const explicitType = typeof rec.type === "string" ? rec.type : undefined;
    const command = typeof rec.command === "string" ? rec.command : undefined;
    const url = typeof rec.url === "string" ? rec.url : undefined;
    const args = Array.isArray(rec.args)
      ? (rec.args as unknown[]).filter((a): a is string => typeof a === "string")
      : undefined;
    const env = readStringRecord(rec.env);
    const headers = readStringRecord(rec.headers);

    // `disabled` is intentionally NOT read from this per-entry field —
    // Claude Code never honors it (see setProjectMcpServerDisabled);
    // effective disabled state is stamped afterwards from the project
    // entry's `disabledMcpServers` and, for project-scope servers, the
    // `disabledMcpjsonServers` settings arrays.
    servers.push({
      name,
      type: resolveServerType(explicitType, command, url),
      command,
      args,
      url,
      env,
      headers,
      scope: opts.scope,
      pluginName: opts.scope === "plugin" ? opts.pluginName : undefined,
    });
  }
  return servers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read a config file for listing: its parsed object, `{}` when absent, or a
 * user-readable failure naming the file.
 */
function readConfigForList(p: string): { config: Record<string, unknown>; error?: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(p, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { config: {} };
    const message = (err as Error).message;
    console.warn(`[claude-manager] Failed to read MCP config ${p}:`, message);
    return { config: {}, error: `Failed to read ${p}: ${message}` };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return { config: isRecord(parsed) ? parsed : {} };
  } catch (err: unknown) {
    const message = (err as Error).message;
    console.warn(`[claude-manager] Failed to parse MCP config ${p}:`, message);
    return { config: {}, error: `Failed to parse ${p}: ${message}` };
  }
}

function readMcpServersFromFile(filePath: string, opts: McpReadOpts): FileParseResult {
  return mcpCache.get(filePath, (p) => {
    const { config, error } = readConfigForList(p);
    return { servers: buildServersFromBlock(config.mcpServers, opts), error };
  });
}

/**
 * What the MCP tab needs from ~/.claude.json: the user-scope servers and the
 * raw `projects` map, whose entry for the open workspace carries its local
 * servers and `/mcp` toggles. Cached on the file's mtime — it is large, and
 * every parse needs both halves.
 */
interface ClaudeJsonMcp {
  user: McpServer[];
  projects: Record<string, unknown>;
  error?: string;
}

const claudeJsonCache = createMtimeCache<ClaudeJsonMcp>();

function readClaudeJsonMcp(): ClaudeJsonMcp {
  return claudeJsonCache.get(CLAUDE_JSON_FILE, (p) => {
    const { config, error } = readConfigForList(p);
    return {
      user: buildServersFromBlock(config.mcpServers, { scope: "global" }),
      projects: isRecord(config.projects) ? config.projects : {},
      error,
    };
  });
}

function toStringSet(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
}

/** The workspace's `projects` entry in ~/.claude.json, as far as MCP goes. */
interface ProjectEntryMcp {
  /** `mcpServers` — what `claude mcp add` writes with its default `--scope local`. */
  servers: McpServer[];
  /** `disabledMcpServers` — the names `/mcp` turned off for this project. */
  disabled: Set<string>;
}

function readProjectEntryMcp(workspacePath: string): ProjectEntryMcp {
  const entry = readClaudeJsonMcp().projects[claudeProjectKey(workspacePath)];
  if (!isRecord(entry)) return { servers: [], disabled: new Set() };
  return {
    servers: buildServersFromBlock(entry.mcpServers, { scope: "local" }),
    disabled: toStringSet(entry.disabledMcpServers),
  };
}

/**
 * The name `disabledMcpServers` records a server under. Plugin servers are
 * namespaced `plugin:<plugin>:<server>` with the plugin's bare name (no
 * `@marketplace`) — the key the CLI loads them under; every other scope uses
 * the plain server name, so one entry covers a name configured in several.
 */
export function cliServerKey(server: Pick<McpServer, "name" | "scope" | "pluginName">): string {
  if (server.scope !== "plugin") return server.name;
  const pluginName = server.pluginName ?? "";
  const at = pluginName.indexOf("@");
  return `plugin:${at === -1 ? pluginName : pluginName.slice(0, at)}:${server.name}`;
}

/**
 * Read MCP servers contributed by a single plugin.
 *
 * Order of precedence:
 *  1. `manifest.mcpServers` (inline) — wins if present.
 *  2. `<plugin>/.mcp.json` (preferred file form).
 *  3. `<plugin>/mcp.json` (alternative file form).
 *
 * Only one source is used per plugin; inline + file would otherwise
 * duplicate entries by name. The inline form mirrors what claude-code
 * itself loads from the manifest.
 */
function readPluginMcpServers(plugin: ActivePlugin): McpServer[] {
  const opts: McpReadOpts = { scope: "plugin", pluginName: plugin.qualifiedName };
  if (plugin.manifest.mcpServers && typeof plugin.manifest.mcpServers === "object") {
    return buildServersFromBlock(plugin.manifest.mcpServers, opts);
  }
  const file = findPluginMcpFile(plugin);
  if (!file) return [];
  // Plugin manifests are validated at install time by Claude Code, so a
  // parse failure here is a plugin-install problem, not a settings.json
  // problem — not surfaced as a top-level parse error (same policy as
  // the hooks feature's plugin manifests).
  return readMcpServersFromFile(file, opts).servers;
}

/**
 * One settings file's say on project `.mcp.json` servers: names it rejects,
 * names it approves, and whether it approves every project server at once.
 */
interface McpToggleFileState {
  disabled: Set<string>;
  enabled: Set<string>;
  enableAll: boolean;
}

const EMPTY_TOGGLE_STATE: McpToggleFileState = {
  disabled: new Set(),
  enabled: new Set(),
  enableAll: false,
};

function readToggleArrays(filePath: string): McpToggleFileState {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as {
      disabledMcpjsonServers?: unknown;
      enabledMcpjsonServers?: unknown;
      enableAllProjectMcpServers?: unknown;
    };
    return {
      disabled: toStringSet(data.disabledMcpjsonServers),
      enabled: toStringSet(data.enabledMcpjsonServers),
      enableAll: data.enableAllProjectMcpServers === true,
    };
  } catch {
    return EMPTY_TOGGLE_STATE;
  }
}

/**
 * Read the `disabledMcpjsonServers` / `enabledMcpjsonServers` arrays
 * Claude Code itself uses to approve or reject project `.mcp.json` servers,
 * from the local, project and global settings files. This is the real
 * mechanism — NOT any field on the server's `.mcp.json` entry.
 */
function readMcpToggleStates(workspacePath: string): McpToggleFileState[] {
  return [
    claudeSettingsPath("local", workspacePath),
    claudeSettingsPath("project", workspacePath),
    claudeSettingsPath("global", workspacePath),
  ]
    .filter((p): p is string => p !== null)
    .map(readToggleArrays);
}

type ProjectServerApproval = "approved" | "disabled" | "pending";

/**
 * Effective approval of a project-scope server, as the CLI decides it. Claude
 * Code merges these arrays across every settings file before looking, so a
 * rejection in ANY file wins — a local `enabledMcpjsonServers` entry does not
 * override a team `disabledMcpjsonServers` one. Failing a rejection, a name in
 * any approval list or `enableAllProjectMcpServers` anywhere approves it. A
 * server named nowhere is NOT enabled: Claude Code asks the user to approve it
 * before starting it, so it reads as "pending" rather than silently running.
 */
function projectServerApproval(name: string, states: McpToggleFileState[]): ProjectServerApproval {
  if (states.some((s) => s.disabled.has(name))) return "disabled";
  return states.some((s) => s.enabled.has(name) || s.enableAll) ? "approved" : "pending";
}

/**
 * Parse all MCP servers: project (.mcp.json in the workspace root), local
 * (the workspace's ~/.claude.json project entry), global (~/.claude.json
 * top level, plus the legacy file) and plugins.
 *
 * A malformed config file contributes an error string (naming the
 * file) instead of aborting the whole parse — the other scopes still
 * parse normally.
 *
 * @param workspacePath - Absolute path to the current VS Code workspace folder (optional)
 * @returns Discovered servers (project servers first) plus any parse errors
 */
export function parseMcpServers(workspacePath?: string): McpParseResult {
  const servers: McpServer[] = [];
  const errors: string[] = [];

  // Project-level MCP servers: every .mcp.json from the filesystem root
  // down to the workspace, the nearest declaration of a name winning.
  if (workspacePath) {
    const effective = new Map<string, McpServer>();
    for (const file of projectMcpFiles(workspacePath)) {
      const result = readMcpServersFromFile(file, { scope: "project" });
      if (result.error) errors.push(result.error);
      for (const server of result.servers) effective.set(server.name, server);
    }
    servers.push(...effective.values());
  }

  const claudeJson = readClaudeJsonMcp();
  if (claudeJson.error) errors.push(claudeJson.error);
  const projectEntry: ProjectEntryMcp = workspacePath
    ? readProjectEntryMcp(workspacePath)
    : { servers: [], disabled: new Set() };
  servers.push(...projectEntry.servers);

  // Global / user MCP servers. Canonical location is ~/.claude.json's
  // top-level mcpServers (where `claude mcp add -s user` writes); merge the
  // legacy ~/.claude/mcp.json for older setups, deduping by name.
  const globalServers = [...claudeJson.user];
  const seen = new Set(globalServers.map((s) => s.name));
  const legacyResult = readMcpServersFromFile(GLOBAL_MCP_FILE, { scope: "global" });
  if (legacyResult.error) errors.push(legacyResult.error);
  for (const s of legacyResult.servers) {
    if (!seen.has(s.name)) globalServers.push(s);
  }
  servers.push(...globalServers);

  // Plugin-provided MCP servers (read-only).
  for (const plugin of loadActivePlugins(workspacePath)) {
    servers.push(...readPluginMcpServers(plugin));
  }

  // Stamp per-parse state onto copies: the objects above are shared with
  // the mtime cache, and mutating them would make a stamp outlive its
  // cause — a server disabled once would stay disabled after re-enabling,
  // because the toggle rewrites settings.local.json, not .mcp.json.
  const toggleStates = workspacePath ? readMcpToggleStates(workspacePath) : [];
  const stamped = servers.map((server) => {
    const copy: McpServer = { ...server };
    // `/mcp` turns a server off for this project by name, whatever its
    // scope — the CLI filters every server through disabledMcpServers.
    if (projectEntry.disabled.has(cliServerKey(server))) copy.disabled = true;
    // Project servers are additionally gated by the settings files'
    // approval arrays, which have their own mtimes.
    if (server.scope === "project") {
      const approval = projectServerApproval(server.name, toggleStates);
      if (approval === "disabled") copy.disabled = true;
      if (approval === "pending") copy.pendingApproval = true;
    }
    // Local, offline health signal: does the stdio launch command resolve
    // on PATH? url-transport servers are left undefined — the extension
    // never probes network reachability.
    if (server.type === "stdio" && server.command) {
      copy.commandAvailable = commandExistsOnPath(server.command);
    }
    return copy;
  });

  return { servers: stamped, errors };
}

/**
 * True when `command` resolves to an executable on the user's PATH (or
 * is an existing absolute/relative path). Pure filesystem lookup — no
 * process spawn, no network — so it's safe to run on every parse.
 * On Windows, PATHEXT extensions (.exe/.cmd/.bat/…) are tried.
 */
export function commandExistsOnPath(command: string): boolean {
  // An explicit path (absolute or containing a separator) is checked directly.
  if (command.includes("/") || command.includes("\\")) {
    return existsWithExt(command);
  }
  const pathEnv = process.env.PATH ?? process.env.Path ?? "";
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    if (existsWithExt(path.join(dir, command))) return true;
  }
  return false;
}

/** Check a candidate path, trying Windows PATHEXT suffixes when present. */
function existsWithExt(candidate: string): boolean {
  const isFile = (p: string): boolean => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  };
  if (isFile(candidate)) return true;
  if (process.platform === "win32") {
    const exts = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean);
    for (const ext of exts) {
      if (isFile(candidate + ext.toLowerCase()) || isFile(candidate + ext)) return true;
    }
  }
  return false;
}

/**
 * List MCP servers Claude Code has flagged as needing (re-)auth. Keys
 * of `mcp-needs-auth-cache.json` are the server display names Claude
 * uses ("claude.ai Gmail", "claude.ai Google Drive", …). Returns a
 * sorted array; absent file / parse failure → empty array (no badge).
 */
export function readMcpAuthNeeds(): string[] {
  let raw: string;
  try {
    raw = fs.readFileSync(MCP_AUTH_CACHE_FILE, "utf-8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  return Object.keys(parsed as Record<string, unknown>).sort();
}

interface McpToggleSettingsShape {
  disabledMcpjsonServers?: string[];
  enabledMcpjsonServers?: string[];
  [key: string]: unknown;
}

function writeSettingsJson(filePath: string, data: unknown): boolean {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, JSON.stringify(data, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/** Strip the extension's old (non-standard, never-honored) per-entry `disabled` key. */
function stripLegacyDisabledKey(name: string, workspacePath: string): void {
  const mcpFile = projectMcpFileFor(name, workspacePath);
  const read = readJsonObjectForWrite(mcpFile);
  if (!read.ok || read.raw === null) return;
  const config = read.data;
  const servers = config.mcpServers as Record<string, Record<string, unknown>> | undefined;
  const entry = servers?.[name];
  if (!entry || !("disabled" in entry)) return;
  delete entry.disabled;
  writeMcpConfig(mcpFile, config, read.raw);
}

/**
 * The shape Claude Code gives a project entry it has never written: it
 * applies its change to `projects[key] ?? <this>` and stores the result. A
 * first local server or toggle seeds the same object, so the entry reads
 * exactly as if the CLI had created it. A fresh copy per call — callers
 * mutate it.
 */
function newProjectEntry(): Record<string, unknown> {
  return {
    allowedTools: [],
    mcpContextUris: [],
    mcpServers: {},
    enabledMcpjsonServers: [],
    disabledMcpjsonServers: [],
    hasTrustDialogAccepted: false,
    hasClaudeMdExternalIncludesApproved: false,
    hasClaudeMdExternalIncludesWarningShown: false,
  };
}

/**
 * `parent[key]` as an object, seeding it with `seed()` when absent and
 * `create` is set. A present value of the wrong type is never replaced —
 * that would discard whatever the user or the CLI put there.
 */
function childRecord(
  parent: Record<string, unknown>,
  key: string,
  create: boolean,
  seed: () => Record<string, unknown> = () => ({}),
): Record<string, unknown> | undefined {
  const value = parent[key];
  if (isRecord(value)) return value;
  if (value !== undefined || !create) return undefined;
  const fresh = seed();
  parent[key] = fresh;
  return fresh;
}

/** The workspace's entry in a parsed ~/.claude.json, under the CLI's own key. */
function projectEntryIn(
  config: Record<string, unknown>,
  workspacePath: string,
  create: boolean,
): Record<string, unknown> | undefined {
  const projects = childRecord(config, "projects", create);
  return projects && childRecord(projects, claudeProjectKey(workspacePath), create, newProjectEntry);
}

/**
 * Turn a server off (or back on) for this project the way `/mcp` does: by
 * name in the project entry's `disabledMcpServers` in ~/.claude.json. The CLI
 * honors that list for every scope — local, user, plugin and `.mcp.json` —
 * and applies it to this project only, even for a user-scope server.
 *
 * Mirrors the CLI's write: an emptied list stays as `[]`, and nothing is
 * written when the name is already where it should be.
 */
export function setMcpServerDisabled(
  serverKey: string,
  disabled: boolean,
  workspacePath: string,
): McpWriteResult {
  return withConfigFileLock(CLAUDE_JSON_FILE, () => {
    const read = readConfig(CLAUDE_JSON_FILE);
    if (!read.ok) return { ok: false, error: read.error };
    const current = projectEntryIn(read.config, workspacePath, false)?.disabledMcpServers;
    const list = Array.isArray(current) ? current : [];
    if (list.includes(serverKey) === disabled && (current === undefined || Array.isArray(current))) {
      return { ok: true };
    }
    const entry = projectEntryIn(read.config, workspacePath, true);
    if (!entry) return { ok: false, error: `${CLAUDE_JSON_FILE} has a malformed "projects" entry.` };
    entry.disabledMcpServers = disabled
      ? [...list, serverKey]
      : list.filter((name) => name !== serverKey);
    return writeMcpConfig(CLAUDE_JSON_FILE, read.config, read.raw)
      ? { ok: true }
      : { ok: false, error: `Failed to write ${CLAUDE_JSON_FILE}.` };
  });
}

/**
 * Enable/disable a **project-scope** MCP server the way Claude Code
 * actually does: through the `disabledMcpjsonServers` /
 * `enabledMcpjsonServers` arrays of `<workspace>/.claude/settings.local.json`
 * (a personal, gitignored file — this is a per-developer preference, not a
 * team-wide config change). Other scopes go through setMcpServerDisabled.
 *
 * settings.local.json is read through the shared refusal rule
 * (readJsonObjectForWrite): writing into a file we could not read would
 * replace it with nothing but these two keys.
 *
 * `enabledMcpjsonServers` is Claude Code's APPROVAL list — the CLI writes it
 * when the user accepts its "New MCP servers found in .mcp.json" prompt — so
 * enabling always records the name there. Dropping it instead would leave
 * the server in neither list, and the CLI would ask for approval again.
 *
 * Enabling also clears the name from `disabledMcpServers`: `/mcp` records a
 * project server's switch there too, and the CLI honors either list.
 */
export function setProjectMcpServerDisabled(
  name: string,
  disabled: boolean,
  workspacePath: string,
): McpWriteResult {
  const filePath = claudeSettingsPath("local", workspacePath);
  if (!filePath) return { ok: false, error: "Open a folder to toggle its MCP servers." };
  if (!disabled) {
    // The CLI unions the rejection lists of every settings file, so a local
    // approval cannot outvote a shared one; say where the rejection lives.
    const rejecting = [claudeSettingsPath("project", workspacePath), claudeSettingsPath("global")]
      .filter((p): p is string => p !== null)
      .find((p) => readToggleArrays(p).disabled.has(name));
    if (rejecting) {
      return {
        ok: false,
        error: `${rejecting} lists "${name}" in disabledMcpjsonServers, which Claude Code honors over any local approval. Remove it there.`,
      };
    }
  }
  const read = readJsonObjectForWrite(filePath);
  if (!read.ok) return { ok: false, error: `${describeReadRefusal(filePath, read)}.` };
  const data = read.data as McpToggleSettingsShape;

  const removeFromArray = (key: "disabledMcpjsonServers" | "enabledMcpjsonServers"): void => {
    const arr = data[key];
    if (!Array.isArray(arr)) return;
    const next = arr.filter((v) => v !== name);
    if (next.length > 0) data[key] = next;
    else delete data[key];
  };

  const addToArray = (key: "disabledMcpjsonServers" | "enabledMcpjsonServers"): void => {
    const arr = data[key];
    if (Array.isArray(arr)) {
      if (!arr.includes(name)) arr.push(name);
    } else {
      data[key] = [name];
    }
  };

  if (disabled) {
    addToArray("disabledMcpjsonServers");
    removeFromArray("enabledMcpjsonServers");
  } else {
    removeFromArray("disabledMcpjsonServers");
    addToArray("enabledMcpjsonServers");
  }

  // Best-effort cleanup of a stale key a previous version may have
  // written; failure here doesn't affect the toggle's own success.
  stripLegacyDisabledKey(name, workspacePath);

  if (!writeSettingsJson(filePath, data)) return { ok: false, error: `Failed to write ${filePath}.` };
  return disabled ? { ok: true } : setMcpServerDisabled(name, false, workspacePath);
}

/**
 * Where an editable scope keeps its servers: the file, and the `mcpServers`
 * map inside its parsed config (`create` builds the path to it when absent).
 */
interface McpServersTarget {
  file: string;
  servers(config: Record<string, unknown>, create: boolean): Record<string, unknown> | undefined;
}

function topLevelServers(file: string): McpServersTarget {
  return { file, servers: (config, create) => childRecord(config, "mcpServers", create) };
}

/**
 * Local scope: `projects[<CLI key>].mcpServers` in ~/.claude.json, the entry
 * `claude mcp add` writes by default. Keyed exactly as the CLI keys it, so a
 * subfolder or worktree of a repo lands on the repo's existing entry instead
 * of a second one the CLI would never read.
 */
function localServers(workspacePath: string): McpServersTarget {
  return {
    file: CLAUDE_JSON_FILE,
    servers: (config, create) => {
      const entry = projectEntryIn(config, workspacePath, create);
      return entry && childRecord(entry, "mcpServers", create);
    },
  };
}

/**
 * Resolve the write target for an editable-scope server.
 *
 * A new global server always goes to ~/.claude.json — the only global file
 * Claude Code reads (`claude mcp add -s user` writes there too). Resolving
 * it by name, as edits do, sent every new server to the legacy
 * ~/.claude/mcp.json, where Claude Code never sees it. An existing server
 * keeps targeting whichever file holds it.
 */
function serverTarget(
  scope: string,
  name: string,
  purpose: "add" | "edit",
  workspacePath?: string,
): McpServersTarget | null {
  if (scope === "global") {
    return topLevelServers(purpose === "add" ? CLAUDE_JSON_FILE : globalMcpFileFor(name));
  }
  if (!workspacePath) return null;
  if (scope === "project") {
    return topLevelServers(
      purpose === "add" ? path.join(workspacePath, ".mcp.json") : projectMcpFileFor(name, workspacePath),
    );
  }
  if (scope === "local") return localServers(workspacePath);
  return null;
}

/**
 * Delete an MCP server entry from its config file.
 *
 * @param name - The server name (key in mcpServers)
 * @param scope - Which config file to modify
 * @param workspacePath - Workspace path (needed for project and local scope)
 */
export function deleteMcpServer(
  name: string,
  scope: McpServerScope,
  workspacePath?: string,
): McpWriteResult {
  if (scope === "plugin") {
    return { ok: false, error: `"${name}" is provided by a plugin — manage it via /plugin.` };
  }
  const target = serverTarget(scope, name, "edit", workspacePath);
  if (!target) return { ok: false, error: `Cannot write to ${scope} scope without a workspace.` };

  return withConfigFileLock(target.file, () => {
    const read = readConfig(target.file);
    if (!read.ok) return { ok: false, error: read.error };
    const servers = target.servers(read.config, false);
    if (!servers || !(name in servers)) {
      return { ok: false, error: `Server "${name}" was not found — it may have been edited on disk.` };
    }
    delete servers[name];
    return writeMcpConfig(target.file, read.config, read.raw)
      ? { ok: true }
      : { ok: false, error: "Failed to write MCP config." };
  });
}

/** Build the raw `.mcp.json` entry object for a server from form input. */
function buildServerEntry(input: McpServerInput): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  if (input.transport === "stdio") {
    if (input.command) entry.command = input.command;
    if (input.args && input.args.length > 0) entry.args = input.args;
  } else {
    // http / sse / ws — record the transport explicitly and the URL.
    entry.type = input.transport;
    if (input.url) entry.url = input.url;
  }
  if (input.env && Object.keys(input.env).length > 0) entry.env = input.env;
  if (input.headers && Object.keys(input.headers).length > 0) entry.headers = input.headers;
  return entry;
}

/**
 * Read a config file's raw text + parsed object, or the reason it must not
 * be rewritten — the shared rule in readJsonObjectForWrite.
 *
 * Answering a refused file (unparseable, unreadable, or emptied by a
 * Claude Code rewrite in progress) with an empty config is
 * indistinguishable from a brand-new file, so addMcpServer would write
 * `{ mcpServers: { new } }` over it, discarding every other server (and,
 * for ~/.claude.json, the account and per-project state stored beside
 * them). An absent file has no raw text; "" keeps writeMcpConfig's
 * formatting probe working.
 */
function readConfig(
  filePath: string,
): { ok: true; raw: string; config: Record<string, unknown> } | { ok: false; error: string } {
  const read = readJsonObjectForWrite(filePath);
  if (!read.ok) return { ok: false, error: `${describeReadRefusal(filePath, read)}.` };
  return { ok: true, raw: read.raw ?? "", config: read.data };
}

export interface McpWriteResult {
  ok: boolean;
  error?: string;
}

/**
 * Add a new MCP server to the target scope's config file (creating the
 * file if needed). Rejects a duplicate name in that scope.
 */
export function addMcpServer(input: McpServerInput, workspacePath?: string): McpWriteResult {
  if (!input.name.trim()) return { ok: false, error: "Server name is required." };
  const target = serverTarget(input.scope, input.name, "add", workspacePath);
  if (!target) {
    return { ok: false, error: `Cannot write to ${input.scope} scope without a workspace.` };
  }
  const duplicate = `An MCP server named "${input.name}" already exists in ${input.scope} scope.`;
  // A legacy-file server of the same name would be shadowed by the new one
  // (the parse prefers ~/.claude.json), so it counts as a duplicate.
  if (
    input.scope === "global" &&
    readMcpServersFromFile(GLOBAL_MCP_FILE, { scope: "global" }).servers.some((s) => s.name === input.name)
  ) {
    return { ok: false, error: duplicate };
  }
  // Likewise a project server an ancestor .mcp.json already declares: the
  // workspace's own file would silently override it.
  if (input.scope === "project" && workspacePath) {
    const holder = projectMcpFileFor(input.name, workspacePath);
    if (canonicalPath(holder) !== canonicalPath(target.file)) {
      return { ok: false, error: `An MCP server named "${input.name}" is already declared in ${holder}.` };
    }
  }
  return withConfigFileLock(target.file, () => {
    const read = readConfig(target.file);
    if (!read.ok) return { ok: false, error: read.error };
    const { raw, config } = read;
    const servers = target.servers(config, true);
    if (!servers) return { ok: false, error: `${target.file} has a malformed "mcpServers" entry.` };
    if (input.name in servers) return { ok: false, error: duplicate };
    servers[input.name] = buildServerEntry(input);
    // A brand-new file (no prior newline-indented content) should still be
    // pretty-printed; seed the indent hint so writeMcpConfig formats it.
    const indentHint = raw || '{\n  "mcpServers": {}\n}';
    return writeMcpConfig(target.file, config, indentHint)
      ? { ok: true }
      : { ok: false, error: "Failed to write MCP config." };
  });
}

/**
 * Update an existing MCP server in place. Supports renaming (removes the
 * old key, writes the new). Identified by `originalName` within the
 * server's scope.
 */
export function updateMcpServer(
  originalName: string,
  input: McpServerInput,
  workspacePath?: string,
): McpWriteResult {
  if (!input.name.trim()) return { ok: false, error: "Server name is required." };
  const target = serverTarget(input.scope, originalName, "edit", workspacePath);
  if (!target) {
    return { ok: false, error: `Cannot write to ${input.scope} scope without a workspace.` };
  }
  return withConfigFileLock(target.file, () => {
    const read = readConfig(target.file);
    if (!read.ok) return { ok: false, error: read.error };
    const { raw, config } = read;
    const servers = target.servers(config, false);
    if (!servers || !(originalName in servers)) {
      return { ok: false, error: `Server "${originalName}" was not found — it may have been edited on disk.` };
    }
    if (input.name !== originalName && input.name in servers) {
      return { ok: false, error: `An MCP server named "${input.name}" already exists.` };
    }
    delete servers[originalName];
    servers[input.name] = buildServerEntry(input);
    return writeMcpConfig(target.file, config, raw)
      ? { ok: true }
      : { ok: false, error: "Failed to write MCP config." };
  });
}
