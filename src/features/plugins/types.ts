/**
 * Domain types for the Plugins feature.
 *
 * Claude Code's plugin system has two halves that live in different places
 * and never agree with each other:
 *
 *   1. INSTALLS — `~/.claude/plugins/installed_plugins.json` plus the
 *      extracted content under `~/.claude/plugins/cache/`, and the plugins
 *      synced from claude.ai under `~/.claude/plugins/synced/`. Owned by
 *      `src/core/plugins.ts`.
 *   2. ENABLEMENT — the `enabledPlugins` map inside the settings files,
 *      resolved across scopes.
 *
 * Nothing reconciles the two for the user. The three states this feature
 * exists to surface are exactly the disagreements: a plugin that is
 * installed but never enabled, an `enabledPlugins` entry with no install
 * behind it, and a plugin enabled from a marketplace the policy does not
 * allow.
 *
 * Shapes here were validated against a real `~/.claude/plugins/` tree and
 * against the settings schema embedded in the Claude Code binary
 * (v2.1.273) — see parser.ts for the specific citations.
 */

/**
 * A settings file that can carry plugin keys, ordered by Claude Code's own
 * precedence (later wins).
 *
 * Claude Code names these `userSettings < projectSettings < localSettings <
 * flagSettings < policySettings`. We keep the extension's existing
 * `global/project/local` vocabulary for the three file scopes (so a plugin
 * scope badge reads the same as a hook or MCP scope badge) and add
 * `managed` for the admin policy file. `flagSettings` (the CLI's
 * `--settings` flag) has no file we can find and is deliberately absent.
 */
export type PluginSettingsScope = "global" | "project" | "local" | "managed";

/** Where `claude plugin install --scope` records an install. */
export type PluginInstallScope = "user" | "project" | "local";

/** One scope's opinion about one plugin. */
export interface PluginScopeDecision {
  scope: PluginSettingsScope;
  enabled: boolean;
}

/**
 * How a plugin row relates to the two halves of the system.
 *
 *  - `enabled`     — installed, and the winning scope says true.
 *  - `disabled`    — installed, and the winning scope says false.
 *  - `not-enabled` — installed, and NO scope mentions it. Claude Code will
 *                    not load it; the bytes are on disk doing nothing.
 *  - `orphaned`    — an `enabledPlugins` entry with no matching install.
 *  - `blocked`     — listed in `~/.claude/plugins/blocklist.json`. Wins over
 *                    everything else: Claude Code refuses to load it whatever
 *                    the settings say.
 */
export type PluginStatus = "enabled" | "disabled" | "not-enabled" | "orphaned" | "blocked";

/**
 * How much the marketplace a plugin came from is trusted.
 *
 *  - `official`    — Anthropic's own marketplace, exempt from the allowlist.
 *  - `allowlisted` — matched an entry of the managed `strictKnownMarketplaces`.
 *  - `unlisted`    — an allowlist IS in force and this marketplace is not on
 *                    it. Claude Code will refuse to add it.
 *  - `blocked`     — matched an entry of the managed `blockedMarketplaces`.
 *  - `known`       — registered in `known_marketplaces.json` with no policy
 *                    in force. The ordinary case.
 *  - `unknown`     — referenced by a plugin id but never registered.
 */
export type MarketplaceTrust =
  | "official"
  | "allowlisted"
  | "unlisted"
  | "blocked"
  | "known"
  | "unknown";

/** One plugin, reconciled across installs, settings and the blocklist. */
export interface PluginEntry {
  /**
   * `<name>@<marketplace>`, the key Claude Code uses everywhere. A plugin
   * synced from claude.ai carries Claude Code's sentinel `<name>@synced`.
   */
  id: string;
  name: string;
  /** Marketplace name, or "claude.ai" for a synced plugin. */
  marketplace: string;
  /**
   * Synced from the signed-in claude.ai account (`~/.claude/plugins/synced/`).
   * Sync turns it on, and its files are replaced every sync round, so it is
   * read-only here: managed on claude.ai, or switched off with
   * `syncClaudeAiPlugins: false`.
   */
  synced: boolean;
  /** From `.claude-plugin/plugin.json`. Empty when the manifest is absent. */
  description: string;
  /** Version directory name from the install record. Empty when not installed. */
  version: string;
  /** Absolute plugin root. Empty when not installed. */
  installPath: string;
  /** Whether the install record is user-wide or pinned to a project. */
  installScope: "user" | "project" | "";
  /** A verified install directory exists for this id in the current context. */
  installed: boolean;
  /** The effective enablement after resolving every scope. */
  enabled: boolean;
  /** Scope that won, or null when no settings file mentions this plugin. */
  decidedBy: PluginSettingsScope | null;
  /** Every scope that mentioned it, lowest precedence first. */
  declaredIn: PluginScopeDecision[];
  status: PluginStatus;
  /** Trust of `marketplace`, copied here so a row renders without a lookup. */
  marketplaceTrust: MarketplaceTrust;
  /**
   * The plugin is active but its marketplace is `unlisted` or `blocked` —
   * a policy violation the user cannot see anywhere else.
   */
  untrustedSource: boolean;
  /** Merged `pluginConfigs[id]`, or null when no scope configures it. */
  config: Record<string, unknown> | null;
}

/** A marketplace, from `known_marketplaces.json` and/or settings. */
export interface MarketplaceEntry {
  name: string;
  /** `source.source` — "github", "git", "local", "command", … */
  sourceKind: string;
  /** Human label for the source: a repo slug, a URL, a path. */
  sourceLabel: string;
  /** Clone location under `~/.claude/plugins/marketplaces/`. */
  installLocation: string;
  /** ISO timestamp of the last refresh, from `known_marketplaces.json`. */
  lastUpdated: string;
  /** Present in `known_marketplaces.json` (i.e. actually cloned). */
  registered: boolean;
  /** Scopes whose `extraKnownMarketplaces` pre-register this name. */
  declaredIn: PluginSettingsScope[];
  trust: MarketplaceTrust;
  /** How many plugin rows cite this marketplace. */
  pluginCount: number;
}

/**
 * One plugin-related settings key, with the scope that won it.
 *
 * Several of these keys are honoured by Claude Code ONLY from managed
 * settings and silently ignored in user/project/local files. Recording
 * `ignored` is the point of this list: a user who put
 * `strictKnownMarketplaces` in `~/.claude/settings.json` believes they have
 * a policy and does not.
 */
export interface PluginPolicyEntry {
  key: string;
  scope: PluginSettingsScope;
  value: string[] | boolean;
  /** Claude Code reads this key from managed settings only. */
  managedOnly: boolean;
  /**
   * Found in a file Claude Code does not read it from — managed-only keys
   * outside managed settings, and the claude.ai sync opt-outs in project or
   * local settings. Claude Code ignores it.
   */
  ignored: boolean;
}

/**
 * A plugin a registered marketplace offers, from that marketplace's catalog.
 * Already-installed entries stay in the list, flagged, so the catalog reads
 * as the whole marketplace rather than a list with gaps.
 */
export interface AvailablePlugin {
  /** `<name>@<marketplace>` — safe to pass to `claude plugin install` unquoted. */
  id: string;
  name: string;
  marketplace: string;
  description: string;
  /** The catalog's category ("development", "database", …), or "". */
  category: string;
  /** The author's name, or "". */
  author: string;
  /** An https setup page, or "". */
  homepage: string;
  installed: boolean;
}

/** The whole payload the host sends to the Plugins tab. */
export interface PluginsData {
  plugins: PluginEntry[];
  marketplaces: MarketplaceEntry[];
  policy: PluginPolicyEntry[];
  /** Everything the registered marketplaces offer, installable or installed. */
  available: AvailablePlugin[];
  /** Non-fatal problems: an unreadable settings file, an ignored alias key. */
  errors: string[];
}
