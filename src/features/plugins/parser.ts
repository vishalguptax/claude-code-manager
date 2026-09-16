/**
 * Plugin + marketplace reconciliation.
 *
 * ── Where the data actually lives (verified against a real tree) ───────────
 *
 *   ~/.claude/plugins/
 *     installed_plugins.json   { version: 2, plugins: { "<name>@<mkt>": [ {
 *                                scope, projectPath?, installPath, version,
 *                                installedAt, lastUpdated, gitCommitSha } ] } }
 *     known_marketplaces.json  { "<mkt>": { source: { source: "github",
 *                                repo: "owner/repo" }, installLocation,
 *                                lastUpdated } }
 *     blocklist.json           { plugins: [ { plugin: "<name>@<mkt>" } ] }
 *     cache/<mkt>/<plugin>/<version>/      -- the extracted plugin
 *     marketplaces/<mkt>/                  -- the cloned marketplace repo,
 *                                             with .claude-plugin/marketplace.json
 *     data/<plugin>-<mkt>/                 -- plugin runtime data
 *     plugin-catalog-cache.json            -- a ~460 KB catalogue of every
 *                                             plugin in every known marketplace
 *
 * `cache/` and `marketplaces/` are the bulk (87 MB on the machine this was
 * written against). Nothing here walks them: the plugin list comes from the
 * manifest, and the only filesystem touch per plugin is the `statSync` that
 * `loadActivePlugins` already does.
 *
 * ── Settings semantics (from the Claude Code v2.1.273 settings schema) ─────
 *
 * Precedence is `user < project < local < flag < policy`; `enabledPlugins`,
 * `pluginConfigs` and `extraKnownMarketplaces` are SHALLOW-MERGED across
 * sources rather than replaced, so precedence is per plugin id, not per file.
 *
 * Two keys in the feature brief are aliases, not separate settings — the
 * binary carries the mapping literally:
 *   `additionalMarketplaces` → `extraKnownMarketplaces`
 *   `allowedMarketplaces`    → `strictKnownMarketplaces`
 * "Do not set both in one file — if both appear, this key is ignored with a
 * warning", which is reproduced below.
 *
 * `strictKnownMarketplaces` is an ARRAY (an allowlist of marketplace names or
 * source objects), not a boolean, and along with `blockedMarketplaces`,
 * `appendPlugins`, `prependPlugins`, `allowedChannelPlugins`,
 * `pluginSuggestionMarketplaces` and `disableCommandPluginSources` it is
 * honoured ONLY from managed settings. Finding one in a user settings file is
 * itself a finding, reported via `PluginPolicyEntry.ignored`.
 *
 * Every read goes through `openFileNoFollow`: these files sit in trees the
 * extension does not own.
 */
import * as fs from "fs";
import * as path from "path";
import { CLAUDE_DIR, SETTINGS_FILE, claudeSettingsPath } from "../../core/config";
import { type ActivePlugin, loadActivePlugins } from "../../core/plugins";
import { openFileNoFollow } from "../../core/safeOpen";
import {
  type MarketplaceEntry,
  type MarketplaceTrust,
  type PluginEntry,
  type PluginPolicyEntry,
  type PluginScopeDecision,
  type PluginSettingsScope,
  type PluginStatus,
  type PluginsData,
} from "./types";

/** `~/.claude/plugins/`. */
export const PLUGINS_ROOT: string = path.join(CLAUDE_DIR, "plugins");

/** Marketplace registry — the only place a marketplace's source is recorded. */
export const KNOWN_MARKETPLACES_FILE: string = path.join(
  PLUGINS_ROOT,
  "known_marketplaces.json",
);

/**
 * Plugins Claude Code refuses to load.
 *
 * `src/core/plugins.ts` reads this file too, but privately: it drops blocked
 * plugins from `loadActivePlugins` entirely, because its job is to enumerate
 * content that is live. This tab has the opposite job — a silently disabled
 * plugin is exactly what the user came to find — so it reads the list again
 * rather than inferring a gap from an absence.
 */
export const BLOCKLIST_FILE: string = path.join(PLUGINS_ROOT, "blocklist.json");

/** Anthropic's marketplace, exempt from `strictKnownMarketplaces` by name. */
export const OFFICIAL_MARKETPLACE = "claude-plugins-official";

/**
 * Settings files are read whole into memory. A settings.json past this is
 * not a settings file, and refusing beats allocating on a filename.
 */
const MAX_JSON_BYTES = 8 * 1024 * 1024;

/**
 * Admin policy file. Claude Code resolves the directory per platform
 * (`/Library/Application Support/ClaudeCode` on macOS,
 * `C:\Program Files\ClaudeCode` on Windows, `/etc/claude-code` elsewhere)
 * and reads `managed-settings.json` from it. MDM/registry policy sources
 * outside the filesystem are not reachable from here, so a machine managed
 * purely by MDM reports no policy — which is why the UI states the source
 * rather than claiming "no policy in force".
 */
export function managedSettingsPath(platform: NodeJS.Platform = process.platform): string {
  const dir =
    platform === "darwin"
      ? "/Library/Application Support/ClaudeCode"
      : platform === "win32"
        ? "C:\\Program Files\\ClaudeCode"
        : "/etc/claude-code";
  return path.join(dir, "managed-settings.json");
}

// ── Low-level reads ────────────────────────────────────────────────────────

/** A plain JSON object, or null for anything else. */
function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Outcome of reading one JSON file: the object, or why there isn't one. */
export type JsonRead =
  | { kind: "ok"; data: Record<string, unknown> }
  | { kind: "absent" }
  | { kind: "invalid"; reason: string };

/**
 * Read one JSON object from disk, refusing symlinks.
 *
 * `absent` and `invalid` are kept apart on purpose. A missing settings file
 * is the normal case and must stay silent; a file that exists but does not
 * parse is a user-visible problem — Claude Code skips such a file wholesale,
 * so every plugin the user configured in it is inert.
 */
export function readJsonObject(filePath: string): JsonRead {
  const fd = openFileNoFollow(filePath);
  if (fd === null) {
    // openFileNoFollow collapses missing / symlink / permission into null.
    // Distinguish "not there" (silent) from "there but unreadable" (report).
    try {
      fs.lstatSync(filePath);
    } catch {
      return { kind: "absent" };
    }
    return { kind: "invalid", reason: "not a regular file, or unreadable" };
  }
  try {
    const { size } = fs.fstatSync(fd);
    if (size === 0) return { kind: "absent" };
    if (size > MAX_JSON_BYTES) {
      return { kind: "invalid", reason: `larger than ${MAX_JSON_BYTES} bytes` };
    }
    const buf = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const read = fs.readSync(fd, buf, offset, size - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    const text = buf.subarray(0, offset).toString("utf-8");
    if (text.trim() === "") return { kind: "absent" };
    const parsed = asObject(JSON.parse(text));
    if (parsed === null) return { kind: "invalid", reason: "not a JSON object" };
    return { kind: "ok", data: parsed };
  } catch (err) {
    return { kind: "invalid", reason: (err as Error).message };
  } finally {
    fs.closeSync(fd);
  }
}

/** A settings scope and the file it resolves to. */
export interface SettingsScopePath {
  scope: PluginSettingsScope;
  filePath: string;
}

/**
 * Every settings file that can carry plugin keys, lowest precedence first.
 * Project and local drop out without a workspace.
 *
 * `globalPath` and `managedPath` default to the real locations and exist so
 * tests can point the resolver at a temp tree — the same seam
 * `openFileNoFollow` uses for its Windows branch.
 */
export function settingsScopePaths(
  workspacePath?: string,
  globalPath: string = SETTINGS_FILE,
  managedPath: string = managedSettingsPath(),
): SettingsScopePath[] {
  const out: SettingsScopePath[] = [{ scope: "global", filePath: globalPath }];
  if (workspacePath) {
    for (const scope of ["project", "local"] as const) {
      const p = claudeSettingsPath(scope, workspacePath);
      if (p) out.push({ scope, filePath: p });
    }
  }
  out.push({ scope: "managed", filePath: managedPath });
  return out;
}

/** One settings file, read and classified. */
export interface SettingsScopeRead extends SettingsScopePath {
  data: Record<string, unknown> | null;
  /** User-readable problem, or null. Absent files produce no error. */
  error: string | null;
}

/** Read one scope's settings file. Never throws. */
export function readSettingsScope(
  scope: PluginSettingsScope,
  filePath: string,
): SettingsScopeRead {
  const res = readJsonObject(filePath);
  if (res.kind === "ok") return { scope, filePath, data: res.data, error: null };
  if (res.kind === "absent") return { scope, filePath, data: null, error: null };
  return {
    scope,
    filePath,
    data: null,
    error: `${filePath} could not be read (${res.reason}) — Claude Code skips it too, so any plugins it configures are inactive.`,
  };
}

/** Raw shape of one `known_marketplaces.json` entry. */
export interface RawMarketplaceSource {
  source?: unknown;
  repo?: unknown;
  url?: unknown;
  path?: unknown;
  [key: string]: unknown;
}

/** A marketplace as registered on disk. */
export interface RawKnownMarketplace {
  source?: RawMarketplaceSource;
  installLocation?: string;
  lastUpdated?: string;
}

/**
 * Read `known_marketplaces.json`. This is the ONLY record of where a
 * marketplace came from — the install path under `marketplaces/` does not
 * carry the repo slug, and on a case-insensitive filesystem it does not even
 * match the recorded `installLocation` byte for byte.
 */
export function readKnownMarketplaces(
  filePath: string = KNOWN_MARKETPLACES_FILE,
): Record<string, RawKnownMarketplace> {
  const res = readJsonObject(filePath);
  if (res.kind !== "ok") return {};
  const out: Record<string, RawKnownMarketplace> = {};
  for (const [name, value] of Object.entries(res.data)) {
    const obj = asObject(value);
    if (!obj) continue;
    out[name] = {
      source: asObject(obj.source) ?? undefined,
      installLocation:
        typeof obj.installLocation === "string" ? obj.installLocation : undefined,
      lastUpdated: typeof obj.lastUpdated === "string" ? obj.lastUpdated : undefined,
    };
  }
  return out;
}

/** Read the blocked plugin ids from `blocklist.json`. */
export function readPluginBlocklist(filePath: string = BLOCKLIST_FILE): string[] {
  const res = readJsonObject(filePath);
  if (res.kind !== "ok") return [];
  const list = res.data.plugins;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const entry of list) {
    const obj = asObject(entry);
    const id = obj?.plugin;
    if (typeof id === "string" && id !== "") out.push(id);
  }
  return out;
}

// ── Plugin ids ─────────────────────────────────────────────────────────────

/**
 * Whether a plugin id is safe to carry through the UI.
 *
 * Nothing here builds a path from an id — install paths come from the
 * install record, never from concatenation — so a traversal attempt cannot
 * reach the filesystem. It is rejected anyway: an id is a settings key any
 * process can write, and `../../etc/passwd@x` rendered as a plugin name in
 * the sidebar is a phishing surface even when it is inert. Rejecting at the
 * parse boundary also means no downstream code has to re-ask.
 *
 * Plugin names legitimately contain dots (`wordpress.com` ships in the
 * official marketplace), so dots are allowed; separators, `..` segments,
 * control characters and whitespace are not.
 */
export function isSafePluginId(id: string): boolean {
  if (id === "" || id.length > 200) return false;
  if (/[\\/\u0000-\u001f\u007f]/.test(id)) return false;
  if (/\s/.test(id)) return false;
  const at = id.lastIndexOf("@");
  if (at <= 0 || at === id.length - 1) return false;
  const name = id.slice(0, at);
  const marketplace = id.slice(at + 1);
  if (name === "." || name === ".." || marketplace === "." || marketplace === "..") {
    return false;
  }
  return !marketplace.includes("@");
}

/** Split `<name>@<marketplace>` on the LAST `@`, as Claude Code does. */
export function splitPluginId(id: string): { name: string; marketplace: string } {
  const at = id.lastIndexOf("@");
  if (at <= 0) return { name: id, marketplace: "" };
  return { name: id.slice(0, at), marketplace: id.slice(at + 1) };
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

// ── Marketplace policy matching ────────────────────────────────────────────

/** A marketplace identity, reduced to what a policy entry can match on. */
interface MarketplaceIdentity {
  name: string;
  sourceKind: string;
  /** repo slug / url / path, whichever the source kind uses. */
  sourceRef: string;
}

/**
 * Does one `strictKnownMarketplaces` / `blockedMarketplaces` entry match a
 * marketplace?
 *
 * Entries are either a bare marketplace NAME or a source object. Source
 * objects "match exactly, except that a github entry may use the
 * owner-wildcard form `{"source":"github","repo":"owner/*"}` to match every
 * repository under that owner".
 */
export function marketplacePolicyMatches(entry: unknown, mkt: MarketplaceIdentity): boolean {
  if (typeof entry === "string") return entry === mkt.name;
  const obj = asObject(entry);
  if (!obj) return false;
  const kind = typeof obj.source === "string" ? obj.source : "";
  if (kind === "" || kind !== mkt.sourceKind) return false;
  const ref =
    typeof obj.repo === "string"
      ? obj.repo
      : typeof obj.url === "string"
        ? obj.url
        : typeof obj.path === "string"
          ? obj.path
          : "";
  if (ref === "") return false;
  if (kind === "github" && ref.endsWith("/*")) {
    const owner = ref.slice(0, -2);
    return owner !== "" && mkt.sourceRef.startsWith(`${owner}/`);
  }
  return ref === mkt.sourceRef;
}

/** Render a policy entry as a label for the UI. */
export function marketplacePolicyLabel(entry: unknown): string {
  if (typeof entry === "string") return entry;
  const obj = asObject(entry);
  if (!obj) return "";
  const kind = typeof obj.source === "string" ? obj.source : "?";
  const ref =
    typeof obj.repo === "string"
      ? obj.repo
      : typeof obj.url === "string"
        ? obj.url
        : typeof obj.path === "string"
          ? obj.path
          : "";
  return ref === "" ? kind : `${kind}:${ref}`;
}

// ── Policy keys ────────────────────────────────────────────────────────────

interface PolicyKeySpec {
  key: string;
  /** Deprecated spelling read "exactly as if it were" `key`. */
  alias?: string;
  kind: "list" | "flag";
  /** Claude Code honours it from managed settings only. */
  managedOnly: boolean;
}

/**
 * The plugin-adjacent settings keys that are single values rather than
 * merged maps. `enabledPlugins`, `pluginConfigs` and
 * `extraKnownMarketplaces` are absent because they merge per entry and are
 * resolved separately.
 *
 * "The highest source that sets one owns it whole" — these replace, they do
 * not merge, so resolving one is a scan for the highest scope that has it.
 */
const POLICY_KEYS: readonly PolicyKeySpec[] = [
  {
    key: "strictKnownMarketplaces",
    alias: "allowedMarketplaces",
    kind: "list",
    managedOnly: true,
  },
  { key: "blockedMarketplaces", kind: "list", managedOnly: true },
  { key: "appendPlugins", kind: "list", managedOnly: true },
  { key: "prependPlugins", kind: "list", managedOnly: true },
  { key: "allowedChannelPlugins", kind: "list", managedOnly: true },
  { key: "pluginSuggestionMarketplaces", kind: "list", managedOnly: true },
  { key: "disableCommandPluginSources", kind: "flag", managedOnly: true },
  { key: "syncClaudeAiPlugins", kind: "flag", managedOnly: false },
  { key: "syncClaudeAiSkills", kind: "flag", managedOnly: false },
] as const;

/**
 * Read a key honouring its alias, and report the "both in one file" case.
 * Returns undefined when neither spelling is present.
 */
function readAliased(
  data: Record<string, unknown>,
  spec: PolicyKeySpec,
  filePath: string,
  errors: string[],
): unknown {
  const canonical = data[spec.key];
  const aliased = spec.alias === undefined ? undefined : data[spec.alias];
  if (canonical !== undefined && aliased !== undefined) {
    errors.push(
      `${filePath} sets both "${spec.key}" and its alias "${spec.alias}" — Claude Code ignores the alias.`,
    );
    return canonical;
  }
  return canonical !== undefined ? canonical : aliased;
}

/** Resolve the single-value policy keys across scopes. */
function resolvePolicy(
  scopes: SettingsScopeRead[],
  errors: string[],
): { entries: PluginPolicyEntry[]; lists: Map<string, unknown[]> } {
  const entries: PluginPolicyEntry[] = [];
  const lists = new Map<string, unknown[]>();

  for (const spec of POLICY_KEYS) {
    // Highest precedence wins outright; scan from the top.
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i];
      if (!scope.data) continue;
      const raw = readAliased(scope.data, spec, scope.filePath, errors);
      if (raw === undefined) continue;

      if (spec.kind === "flag") {
        if (typeof raw !== "boolean") continue;
        entries.push({
          key: spec.key,
          scope: scope.scope,
          value: raw,
          managedOnly: spec.managedOnly,
          ignored: spec.managedOnly && scope.scope !== "managed",
        });
      } else {
        if (!Array.isArray(raw)) continue;
        const honoured = !spec.managedOnly || scope.scope === "managed";
        if (honoured) lists.set(spec.key, raw);
        entries.push({
          key: spec.key,
          scope: scope.scope,
          value: raw.map(marketplacePolicyLabel).filter((l) => l !== ""),
          managedOnly: spec.managedOnly,
          ignored: !honoured,
        });
      }
      break;
    }
  }
  return { entries, lists };
}

// ── Merged maps ────────────────────────────────────────────────────────────

/**
 * Resolve `enabledPlugins` across scopes.
 *
 * The map is shallow-merged, so each plugin id is decided independently by
 * the highest scope that mentions it — which is why a row reports its own
 * winning scope rather than the tab reporting one.
 */
export function resolveEnabledPlugins(
  scopes: SettingsScopeRead[],
): Map<string, { enabled: boolean; decidedBy: PluginSettingsScope; declaredIn: PluginScopeDecision[] }> {
  const out = new Map<
    string,
    { enabled: boolean; decidedBy: PluginSettingsScope; declaredIn: PluginScopeDecision[] }
  >();
  for (const scope of scopes) {
    const map = asObject(scope.data?.enabledPlugins);
    if (!map) continue;
    for (const [id, value] of Object.entries(map)) {
      if (!isSafePluginId(id)) continue;
      const enabled = normaliseEnabledValue(value);
      if (enabled === null) continue;
      const existing = out.get(id);
      const decision: PluginScopeDecision = { scope: scope.scope, enabled };
      if (existing) {
        existing.declaredIn.push(decision);
        existing.enabled = enabled;
        existing.decidedBy = scope.scope;
      } else {
        out.set(id, { enabled, decidedBy: scope.scope, declaredIn: [decision] });
      }
    }
  }
  return out;
}

/** Shallow-merge `pluginConfigs` across scopes, per plugin id. */
export function resolvePluginConfigs(
  scopes: SettingsScopeRead[],
): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const scope of scopes) {
    const map = asObject(scope.data?.pluginConfigs);
    if (!map) continue;
    for (const [id, value] of Object.entries(map)) {
      if (!isSafePluginId(id)) continue;
      const cfg = asObject(value);
      if (!cfg) continue;
      out.set(id, { ...(out.get(id) ?? {}), ...cfg });
    }
  }
  return out;
}

/** Shallow-merge `extraKnownMarketplaces` (alias `additionalMarketplaces`). */
export function resolveExtraMarketplaces(
  scopes: SettingsScopeRead[],
  errors: string[],
): Map<string, { source: RawMarketplaceSource | null; declaredIn: PluginSettingsScope[] }> {
  const out = new Map<
    string,
    { source: RawMarketplaceSource | null; declaredIn: PluginSettingsScope[] }
  >();
  const spec: PolicyKeySpec = {
    key: "extraKnownMarketplaces",
    alias: "additionalMarketplaces",
    kind: "list",
    managedOnly: false,
  };
  for (const scope of scopes) {
    if (!scope.data) continue;
    const map = asObject(readAliased(scope.data, spec, scope.filePath, errors));
    if (!map) continue;
    for (const [name, value] of Object.entries(map)) {
      if (name === "") continue;
      const source = asObject(asObject(value)?.source);
      const existing = out.get(name);
      if (existing) {
        if (source) existing.source = source;
        existing.declaredIn.push(scope.scope);
      } else {
        out.set(name, { source, declaredIn: [scope.scope] });
      }
    }
  }
  return out;
}

// ── Assembly ───────────────────────────────────────────────────────────────

/** Everything `buildPluginsData` needs, so the assembly stays pure. */
export interface PluginSources {
  /** Settings files lowest precedence first. */
  scopes: SettingsScopeRead[];
  /** Installs live in this context, from `core/plugins.ts`. */
  active: ActivePlugin[];
  known: Record<string, RawKnownMarketplace>;
  blocked: string[];
}

/** Describe a marketplace source object for display. */
function describeSource(source: RawMarketplaceSource | null | undefined): {
  kind: string;
  ref: string;
} {
  if (!source) return { kind: "", ref: "" };
  const kind = typeof source.source === "string" ? source.source : "";
  const ref =
    typeof source.repo === "string"
      ? source.repo
      : typeof source.url === "string"
        ? source.url
        : typeof source.path === "string"
          ? source.path
          : "";
  return { kind, ref };
}

/** The version directory is the last segment of the install path. */
function versionFromInstall(plugin: ActivePlugin): string {
  if (typeof plugin.manifest.version === "string" && plugin.manifest.version !== "") {
    return plugin.manifest.version;
  }
  const base = path.basename(plugin.installPath);
  return base === "" ? "" : base;
}

/**
 * Reconcile installs, settings and the blocklist into the tab's payload.
 *
 * Pure: every filesystem touch happens in {@link readPluginSources}, which
 * is what makes the interesting cases (scope overrides, orphans, untrusted
 * sources) testable as data rather than as a temp directory.
 */
export function buildPluginsData(sources: PluginSources): PluginsData {
  const errors: string[] = [];
  for (const scope of sources.scopes) if (scope.error) errors.push(scope.error);

  const { entries: policy, lists } = resolvePolicy(sources.scopes, errors);
  const allowList = lists.get("strictKnownMarketplaces") ?? [];
  const blockList = lists.get("blockedMarketplaces") ?? [];
  const enablement = resolveEnabledPlugins(sources.scopes);
  const configs = resolvePluginConfigs(sources.scopes);
  const extra = resolveExtraMarketplaces(sources.scopes, errors);
  const blockedIds = new Set(sources.blocked.filter(isSafePluginId));

  // ── Marketplaces: every name any source mentions.
  const marketplaceNames = new Set<string>();
  for (const name of Object.keys(sources.known)) marketplaceNames.add(name);
  for (const name of extra.keys()) marketplaceNames.add(name);
  for (const plugin of sources.active) {
    if (plugin.marketplace !== "") marketplaceNames.add(plugin.marketplace);
  }
  for (const id of enablement.keys()) {
    const { marketplace } = splitPluginId(id);
    if (marketplace !== "") marketplaceNames.add(marketplace);
  }
  for (const id of blockedIds) {
    const { marketplace } = splitPluginId(id);
    if (marketplace !== "") marketplaceNames.add(marketplace);
  }

  const trustByName = new Map<string, MarketplaceTrust>();
  const marketplaces: MarketplaceEntry[] = [];
  for (const name of [...marketplaceNames].sort((a, b) => a.localeCompare(b))) {
    const registered = sources.known[name];
    const declared = extra.get(name);
    const { kind, ref } = describeSource(registered?.source ?? declared?.source);
    const identity: MarketplaceIdentity = { name, sourceKind: kind, sourceRef: ref };

    let trust: MarketplaceTrust;
    if (blockList.some((e) => marketplacePolicyMatches(e, identity))) {
      trust = "blocked";
    } else if (name === OFFICIAL_MARKETPLACE) {
      trust = "official";
    } else if (allowList.length > 0) {
      trust = allowList.some((e) => marketplacePolicyMatches(e, identity))
        ? "allowlisted"
        : "unlisted";
    } else {
      trust = registered ? "known" : "unknown";
    }
    trustByName.set(name, trust);

    marketplaces.push({
      name,
      sourceKind: kind,
      sourceLabel: ref,
      installLocation: registered?.installLocation ?? "",
      lastUpdated: registered?.lastUpdated ?? "",
      registered: Boolean(registered),
      declaredIn: declared?.declaredIn ?? [],
      trust,
      pluginCount: 0,
    });
  }

  // ── Plugins: the union of installed, enabled-somewhere, and blocked.
  const installsById = new Map<string, ActivePlugin>();
  for (const plugin of sources.active) {
    if (isSafePluginId(plugin.qualifiedName)) {
      installsById.set(plugin.qualifiedName, plugin);
    }
  }

  const ids = new Set<string>([
    ...installsById.keys(),
    ...enablement.keys(),
    ...blockedIds,
  ]);

  const plugins: PluginEntry[] = [];
  for (const id of [...ids].sort((a, b) => a.localeCompare(b))) {
    const install = installsById.get(id);
    const decision = enablement.get(id);
    const { name, marketplace } = splitPluginId(id);
    const installed = install !== undefined;
    const enabled = decision?.enabled ?? false;
    const trust = trustByName.get(marketplace) ?? "unknown";

    let status: PluginStatus;
    if (blockedIds.has(id)) status = "blocked";
    else if (!installed) status = "orphaned";
    else if (!decision) status = "not-enabled";
    else status = enabled ? "enabled" : "disabled";

    plugins.push({
      id,
      name,
      marketplace,
      description:
        typeof install?.manifest.description === "string" ? install.manifest.description : "",
      version: install ? versionFromInstall(install) : "",
      installPath: install?.installPath ?? "",
      installScope: install?.installScope ?? "",
      installed,
      enabled,
      decidedBy: decision?.decidedBy ?? null,
      declaredIn: decision?.declaredIn ?? [],
      status,
      marketplaceTrust: trust,
      untrustedSource:
        status !== "blocked" && enabled && (trust === "unlisted" || trust === "blocked"),
      config: configs.get(id) ?? null,
    });
  }

  const countByMarketplace = new Map<string, number>();
  for (const plugin of plugins) {
    countByMarketplace.set(
      plugin.marketplace,
      (countByMarketplace.get(plugin.marketplace) ?? 0) + 1,
    );
  }
  for (const mkt of marketplaces) mkt.pluginCount = countByMarketplace.get(mkt.name) ?? 0;

  return { plugins, marketplaces, policy, errors };
}

/**
 * Read every source this feature needs. The only I/O entry point.
 *
 * `loadActivePlugins` supplies the install side unchanged: it already
 * deduplicates install records, filters project-scoped installs down to the
 * open workspace, and verifies each directory exists, so a stale registry
 * entry never becomes a ghost row here.
 */
export function readPluginSources(workspacePath?: string): PluginSources {
  const scopes = settingsScopePaths(workspacePath).map((s) =>
    readSettingsScope(s.scope, s.filePath),
  );
  return {
    scopes,
    active: loadActivePlugins(workspacePath),
    known: readKnownMarketplaces(),
    blocked: readPluginBlocklist(),
  };
}

/** Read and reconcile everything. The host's single call. */
export function parsePluginsData(workspacePath?: string): PluginsData {
  return buildPluginsData(readPluginSources(workspacePath));
}
