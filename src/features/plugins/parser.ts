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
 *                                             (Claude Code's private cache; the
 *                                             catalog is read from each clone's
 *                                             documented marketplace.json instead)
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
 * Managed settings are the whole policy tier as Claude Code applies it —
 * server-managed remote-settings.json, else managed-settings.json merged with
 * its managed-settings.d drop-ins (see core/managedSettings.ts).
 *
 * Plugins synced from claude.ai (`<name>@synced`) arrive from
 * `loadActivePlugins` with `synced: true`. They have no install record and
 * no marketplace registration; sync itself is what turns them on.
 *
 * Every read goes through `readJsonObject` (no-follow): these files sit in
 * trees the extension does not own.
 */
import * as path from "path";
import { CLAUDE_DIR, SETTINGS_FILE, claudeSettingsPath } from "../../core/config";
import { asObject, readJsonObject } from "../../core/jsonFile";
import { readManagedSettings } from "../../core/managedSettings";
import { type ActivePlugin, loadActivePlugins, normaliseEnabledValue } from "../../core/plugins";
import { type RawCatalogPlugin, buildAvailablePlugins, catalogPath, parseCatalog } from "./catalog";
import { isSafePluginId, splitPluginId } from "./ids";
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
  managedPath: string = readManagedSettings().source,
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

/**
 * The managed tier as one scope. Its `filePath` is the source that won, so
 * "open managed settings" lands on the file whose policy is in force.
 */
export function readManagedScope(
  read: ReturnType<typeof readManagedSettings> = readManagedSettings(),
): SettingsScopeRead {
  return {
    scope: "managed",
    filePath: read.source,
    data: read.settings,
    error: read.errors.length > 0 ? read.errors.join(" ") : null,
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

/**
 * Read each registered marketplace's catalog from its clone. A missing or
 * malformed catalog yields no entries rather than an error: the marketplace
 * still lists under Sources, and `/plugin` is where Claude Code reports and
 * repairs a broken clone.
 */
export function readMarketplaceCatalogs(
  known: Record<string, RawKnownMarketplace>,
): Record<string, RawCatalogPlugin[]> {
  const out: Record<string, RawCatalogPlugin[]> = {};
  for (const [name, mkt] of Object.entries(known)) {
    if (!mkt.installLocation) continue;
    const res = readJsonObject(catalogPath(mkt.installLocation));
    out[name] = res.kind === "ok" ? parseCatalog(res.data) : [];
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
  /**
   * Claude Code reads it from user and managed settings only — a project or
   * local file that sets it is ignored (the sync opt-outs: "Not read from
   * project settings"; see core/claudeAiSync.ts, which reads them the same way).
   */
  userOrManagedOnly?: true;
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
  { key: "syncClaudeAiPlugins", kind: "flag", managedOnly: false, userOrManagedOnly: true },
  { key: "syncClaudeAiSkills", kind: "flag", managedOnly: false, userOrManagedOnly: true },
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
    // A file Claude Code does not read the key from, kept to report as
    // ignored only when no file it does read sets the key.
    let unread: PluginPolicyEntry | null = null;
    // Highest precedence wins outright; scan from the top.
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i];
      if (!scope.data) continue;
      const raw = readAliased(scope.data, spec, scope.filePath, errors);
      if (raw === undefined) continue;

      if (spec.kind === "flag") {
        if (typeof raw !== "boolean") continue;
        const entry: PluginPolicyEntry = {
          key: spec.key,
          scope: scope.scope,
          value: raw,
          managedOnly: spec.managedOnly,
          ignored: spec.managedOnly && scope.scope !== "managed",
        };
        if (spec.userOrManagedOnly && scope.scope !== "global" && scope.scope !== "managed") {
          unread ??= { ...entry, ignored: true };
          continue;
        }
        entries.push(entry);
        unread = null;
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
    if (unread) entries.push(unread);
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
  /** Each registered marketplace's catalog, keyed by marketplace name. */
  catalogs: Record<string, RawCatalogPlugin[]>;
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
    // `synced` is Claude Code's sentinel for claude.ai sync, not a marketplace.
    if (plugin.marketplace !== "" && !plugin.synced) marketplaceNames.add(plugin.marketplace);
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
    const synced = install?.synced === true;
    // A synced plugin is on because the account syncs it — no settings file
    // has to enable it, so "nothing enables it" would be the wrong finding.
    const enabled = decision?.enabled ?? synced;
    // Sync is not a marketplace, so no marketplace policy grades it.
    const trust = synced ? "known" : (trustByName.get(marketplace) ?? "unknown");

    let status: PluginStatus;
    if (blockedIds.has(id)) status = "blocked";
    else if (!installed) status = "orphaned";
    else if (!decision) status = synced ? "enabled" : "not-enabled";
    else status = enabled ? "enabled" : "disabled";

    plugins.push({
      id,
      name,
      marketplace: synced ? "claude.ai" : marketplace,
      synced,
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
    if (plugin.synced) continue;
    countByMarketplace.set(
      plugin.marketplace,
      (countByMarketplace.get(plugin.marketplace) ?? 0) + 1,
    );
  }
  for (const mkt of marketplaces) mkt.pluginCount = countByMarketplace.get(mkt.name) ?? 0;

  const available = buildAvailablePlugins(
    sources.catalogs,
    trustByName,
    new Set(installsById.keys()),
    blockedIds,
    OFFICIAL_MARKETPLACE,
  );

  return { plugins, marketplaces, policy, available, errors };
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
    s.scope === "managed" ? readManagedScope() : readSettingsScope(s.scope, s.filePath),
  );
  const known = readKnownMarketplaces();
  return {
    scopes,
    active: loadActivePlugins(workspacePath),
    known,
    blocked: readPluginBlocklist(),
    catalogs: readMarketplaceCatalogs(known),
  };
}

/** Read and reconcile everything. The host's single call. */
export function parsePluginsData(workspacePath?: string): PluginsData {
  return buildPluginsData(readPluginSources(workspacePath));
}
