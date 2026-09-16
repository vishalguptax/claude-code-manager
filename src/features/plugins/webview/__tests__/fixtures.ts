/**
 * Realistic Plugins payloads for the webview tests. Values mirror a live
 * `~/.claude/plugins/` tree: real marketplace names, real `owner/repo`
 * sources, real `name@marketplace` ids.
 */
import type {
  MarketplaceEntry,
  PluginEntry,
  PluginPolicyEntry,
  PluginsData,
} from "../../types";

/** An ordinary enabled plugin. */
export function plugin(overrides: Partial<PluginEntry> = {}): PluginEntry {
  return {
    id: "caveman@caveman",
    name: "caveman",
    marketplace: "caveman",
    description: "Talk like caveman. Cut 65% output tokens.",
    version: "0d95a81d35a9",
    installPath: "/home/dev/.claude/plugins/cache/caveman/caveman/0d95a81d35a9",
    installScope: "user",
    installed: true,
    enabled: true,
    decidedBy: "global",
    declaredIn: [{ scope: "global", enabled: true }],
    status: "enabled",
    marketplaceTrust: "known",
    untrustedSource: false,
    config: null,
    ...overrides,
  };
}

/** Installed, but no settings file mentions it. */
export const notEnabled: PluginEntry = plugin({
  id: "ui-ux-pro-max@ui-ux-pro-max-skill",
  name: "ui-ux-pro-max",
  marketplace: "ui-ux-pro-max-skill",
  description: "Design-system review and UI polish skills.",
  version: "2.13.0",
  installScope: "project",
  enabled: false,
  decidedBy: null,
  declaredIn: [],
  status: "not-enabled",
});

/** Enabled in settings with nothing installed behind it. */
export const orphaned: PluginEntry = plugin({
  id: "claude-seo@agricidaniel-claude-seo",
  name: "claude-seo",
  marketplace: "agricidaniel-claude-seo",
  description: "",
  version: "",
  installPath: "",
  installScope: "",
  installed: false,
  decidedBy: "project",
  declaredIn: [{ scope: "project", enabled: true }],
  status: "orphaned",
});

/** Live from a marketplace the managed allowlist does not cover. */
export const untrusted: PluginEntry = plugin({
  id: "rogue@rogue-mkt",
  name: "rogue",
  marketplace: "rogue-mkt",
  description: "Experimental helpers.",
  marketplaceTrust: "unlisted",
  untrustedSource: true,
});

/** Blocked by ~/.claude/plugins/blocklist.json. */
export const blocked: PluginEntry = plugin({
  id: "banned@caveman",
  name: "banned",
  description: "",
  status: "blocked",
  installed: false,
  installPath: "",
  version: "",
});

/** Enabled at the user scope, turned off by the project, back on locally. */
export const overridden: PluginEntry = plugin({
  id: "layered@caveman",
  name: "layered",
  decidedBy: "local",
  declaredIn: [
    { scope: "global", enabled: true },
    { scope: "project", enabled: false },
    { scope: "local", enabled: true },
  ],
});

export function marketplace(overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return {
    name: "caveman",
    sourceKind: "github",
    sourceLabel: "JuliusBrussee/caveman",
    installLocation: "/home/dev/.claude/plugins/marketplaces/caveman",
    lastUpdated: "2026-07-04T14:35:30.720Z",
    registered: true,
    declaredIn: ["global"],
    trust: "known",
    pluginCount: 1,
    ...overrides,
  };
}

export function policyEntry(overrides: Partial<PluginPolicyEntry> = {}): PluginPolicyEntry {
  return {
    key: "strictKnownMarketplaces",
    scope: "managed",
    value: ["claude-plugins-official"],
    managedOnly: true,
    ignored: false,
    ...overrides,
  };
}

/** A whole snapshot with one of everything worth showing. */
export function snapshot(overrides: Partial<PluginsData> = {}): PluginsData {
  return {
    plugins: [plugin(), notEnabled, orphaned, untrusted, blocked],
    marketplaces: [
      marketplace(),
      marketplace({
        name: "rogue-mkt",
        sourceLabel: "someone/rogue",
        installLocation: "/home/dev/.claude/plugins/marketplaces/rogue-mkt",
        declaredIn: [],
        trust: "unlisted",
        pluginCount: 1,
      }),
    ],
    policy: [policyEntry()],
    errors: [],
    ...overrides,
  };
}
