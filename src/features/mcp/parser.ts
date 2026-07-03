/**
 * MCP server parsing — reads MCP server configurations from project-level
 * .mcp.json and global ~/.claude/mcp.json files.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MCP_AUTH_CACHE_FILE, claudeSettingsPath } from "../../core/config";
import { writeFileAtomic } from "../../core/atomicWrite";
import { createMtimeCache } from "../../core/mtimeCache";
import { loadActivePlugins, findPluginMcpFile, type ActivePlugin } from "../../core/plugins";
import type { McpServerInput } from "../../shared/protocol/messages";
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
const CLAUDE_JSON_FILE: string = path.join(os.homedir(), ".claude.json");

/** Legacy global MCP config (~/.claude/mcp.json) — read for older setups. */
const GLOBAL_MCP_FILE: string = path.join(os.homedir(), ".claude", "mcp.json");

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
 * Read and parse MCP servers from a single JSON config file.
 * Returns an empty array if the file does not exist or cannot be parsed.
 *
 * @param filePath - Absolute path to the .mcp.json or mcp.json file
 * @param scope - Whether these are "global" or "project" servers
 * @returns Array of parsed McpServer objects
 */
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
    // effective disabled state for project-scope servers is stamped
    // afterwards from the `disabledMcpjsonServers` settings arrays.
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

function readMcpServersFromFile(filePath: string, opts: McpReadOpts): FileParseResult {
  return mcpCache.get(filePath, (p) => {
    let raw: string;
    try {
      raw = fs.readFileSync(p, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { servers: [] };
      const message = (err as Error).message;
      console.warn(`[claude-manager] Failed to read MCP config ${p}:`, message);
      return { servers: [], error: `Failed to read ${p}: ${message}` };
    }

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch (err: unknown) {
      const message = (err as Error).message;
      console.warn(`[claude-manager] Failed to parse MCP config ${p}:`, message);
      return { servers: [], error: `Failed to parse ${p}: ${message}` };
    }

    return { servers: buildServersFromBlock(config.mcpServers, opts) };
  });
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

/** Server names Claude Code has enabled/disabled via a settings file's arrays. */
interface McpToggleFileState {
  disabled: Set<string>;
  enabled: Set<string>;
}

const EMPTY_TOGGLE_STATE: McpToggleFileState = { disabled: new Set(), enabled: new Set() };

function readToggleArrays(filePath: string): McpToggleFileState {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as {
      disabledMcpjsonServers?: unknown;
      enabledMcpjsonServers?: unknown;
    };
    const toSet = (value: unknown): Set<string> =>
      new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
    return { disabled: toSet(data.disabledMcpjsonServers), enabled: toSet(data.enabledMcpjsonServers) };
  } catch {
    return EMPTY_TOGGLE_STATE;
  }
}

/**
 * Read the `disabledMcpjsonServers` / `enabledMcpjsonServers` arrays
 * Claude Code itself uses to toggle project `.mcp.json` servers,
 * across local → project → global settings files (in that precedence
 * order). This is the real mechanism — NOT any field on the server's
 * `.mcp.json` entry.
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

/** Effective disabled state for a project-scope server: first file that mentions it wins. */
function isProjectServerDisabled(name: string, states: McpToggleFileState[]): boolean {
  for (const state of states) {
    if (state.disabled.has(name)) return true;
    if (state.enabled.has(name)) return false;
  }
  return false;
}

/**
 * Parse all MCP servers from both project-level (.mcp.json in workspace root)
 * and global (~/.claude.json) configuration files.
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

  // Project-level MCP servers (.mcp.json in project root)
  if (workspacePath) {
    const projectMcpFile = path.join(workspacePath, ".mcp.json");
    const result = readMcpServersFromFile(projectMcpFile, { scope: "project" });
    servers.push(...result.servers);
    if (result.error) errors.push(result.error);
  }

  // Global / user MCP servers. Canonical location is ~/.claude.json's
  // top-level mcpServers (where `claude mcp add -s user` writes); merge the
  // legacy ~/.claude/mcp.json for older setups, deduping by name.
  const globalResult = readMcpServersFromFile(CLAUDE_JSON_FILE, { scope: "global" });
  if (globalResult.error) errors.push(globalResult.error);
  const globalServers = globalResult.servers;
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

  // Stamp effective disabled state on project-scope servers. Applied
  // post-cache (not baked into the .mcp.json-keyed cache above) since
  // it depends on settings files, which have their own mtimes.
  if (workspacePath) {
    const states = readMcpToggleStates(workspacePath);
    for (const server of servers) {
      if (server.scope === "project" && isProjectServerDisabled(server.name, states)) {
        server.disabled = true;
      }
    }
  }

  // Stamp a local, offline health signal on stdio servers: does the
  // launch command resolve on PATH? url-transport servers are left
  // undefined — the extension never probes network reachability.
  for (const server of servers) {
    if (server.type === "stdio" && server.command) {
      server.commandAvailable = commandExistsOnPath(server.command);
    }
  }

  return { servers, errors };
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

function readToggleSettings(filePath: string): McpToggleSettingsShape {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as McpToggleSettingsShape;
    }
  } catch {
    // Missing / unparseable — caller proceeds with a fresh shape.
  }
  return {};
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
  const mcpFile = path.join(workspacePath, ".mcp.json");
  let raw: string;
  try {
    raw = fs.readFileSync(mcpFile, "utf-8");
  } catch {
    return;
  }
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
  const servers = config.mcpServers as Record<string, Record<string, unknown>> | undefined;
  const entry = servers?.[name];
  if (!entry || !("disabled" in entry)) return;
  delete entry.disabled;
  writeMcpConfig(mcpFile, config, raw);
}

/**
 * Enable/disable a **project-scope** MCP server the way Claude Code
 * actually does: by adding/removing its name in the
 * `disabledMcpjsonServers` / `enabledMcpjsonServers` arrays of
 * `<workspace>/.claude/settings.local.json` (a personal, gitignored
 * file — this is a per-developer preference, not a team-wide config
 * change). There is no equivalent mechanism for global-scope servers,
 * so this function only handles `project`; callers must reject other
 * scopes before calling.
 *
 * @returns true if the write succeeded
 */
export function setProjectMcpServerDisabled(
  name: string,
  disabled: boolean,
  workspacePath: string,
): boolean {
  const filePath = claudeSettingsPath("local", workspacePath);
  if (!filePath) return false;
  const data = readToggleSettings(filePath);

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
    // Only record an explicit "enabled" override locally when a
    // broader-scope file still disables this name — otherwise there's
    // nothing to override and the local file stays clean.
    const stillDisabledElsewhere = [
      claudeSettingsPath("project", workspacePath),
      claudeSettingsPath("global", workspacePath),
    ]
      .filter((p): p is string => p !== null)
      .map(readToggleArrays)
      .some((s) => s.disabled.has(name));
    if (stillDisabledElsewhere) addToArray("enabledMcpjsonServers");
    else removeFromArray("enabledMcpjsonServers");
  }

  // Best-effort cleanup of a stale key a previous version may have
  // written; failure here doesn't affect the toggle's own success.
  stripLegacyDisabledKey(name, workspacePath);

  return writeSettingsJson(filePath, data);
}

/**
 * Delete an MCP server entry from its config file.
 *
 * @param name - The server name (key in mcpServers)
 * @param scope - Which config file to modify
 * @param workspacePath - Workspace path (needed for project scope)
 * @returns true if the write succeeded
 */
export function deleteMcpServer(
  name: string,
  scope: McpServerScope,
  workspacePath?: string,
): boolean {
  if (scope === "plugin") return false;
  const filePath = scope === "project" && workspacePath
    ? path.join(workspacePath, ".mcp.json")
    : globalMcpFileFor(name);

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return false;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }

  const servers = config.mcpServers as Record<string, unknown> | undefined;
  if (!servers || !(name in servers)) return false;

  delete servers[name];

  return writeMcpConfig(filePath, config, raw);
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

/** Resolve the write target file for an editable-scope server. */
function serverConfigFile(scope: string, name: string, workspacePath?: string): string | null {
  if (scope === "project") {
    return workspacePath ? path.join(workspacePath, ".mcp.json") : null;
  }
  if (scope === "global") return globalMcpFileFor(name);
  return null;
}

/** Read a config file's raw text + parsed object, defaulting to an empty config. */
function readConfig(filePath: string): { raw: string; config: Record<string, unknown> } {
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return { raw: "", config: {} };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { raw, config: parsed as Record<string, unknown> };
    }
  } catch {
    // Malformed — refuse to clobber; callers treat empty config as "can't write".
  }
  return { raw, config: {} };
}

export interface McpWriteResult {
  ok: boolean;
  error?: string;
}

/**
 * Add a new MCP server to the target scope's config file (creating the
 * file if needed). Rejects a duplicate name in that file.
 */
export function addMcpServer(input: McpServerInput, workspacePath?: string): McpWriteResult {
  if (!input.name.trim()) return { ok: false, error: "Server name is required." };
  const filePath = serverConfigFile(input.scope, input.name, workspacePath);
  if (!filePath) {
    return { ok: false, error: `Cannot write to ${input.scope} scope without a workspace.` };
  }
  const { raw, config } = readConfig(filePath);
  const servers = (config.mcpServers as Record<string, unknown>) ?? {};
  if (input.name in servers) {
    return { ok: false, error: `An MCP server named "${input.name}" already exists in ${input.scope} scope.` };
  }
  servers[input.name] = buildServerEntry(input);
  config.mcpServers = servers;
  // A brand-new file (no prior newline-indented content) should still be
  // pretty-printed; seed the indent hint so writeMcpConfig formats it.
  const indentHint = raw || '{\n  "mcpServers": {}\n}';
  return writeMcpConfig(filePath, config, indentHint)
    ? { ok: true }
    : { ok: false, error: "Failed to write MCP config." };
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
  const filePath = serverConfigFile(input.scope, originalName, workspacePath);
  if (!filePath) {
    return { ok: false, error: `Cannot write to ${input.scope} scope without a workspace.` };
  }
  const { raw, config } = readConfig(filePath);
  const servers = config.mcpServers as Record<string, unknown> | undefined;
  if (!servers || !(originalName in servers)) {
    return { ok: false, error: `Server "${originalName}" was not found — it may have been edited on disk.` };
  }
  if (input.name !== originalName && input.name in servers) {
    return { ok: false, error: `An MCP server named "${input.name}" already exists.` };
  }
  delete servers[originalName];
  servers[input.name] = buildServerEntry(input);
  return writeMcpConfig(filePath, config, raw)
    ? { ok: true }
    : { ok: false, error: "Failed to write MCP config." };
}
