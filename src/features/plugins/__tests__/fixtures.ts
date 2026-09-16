/**
 * Fixtures mirroring the real shapes under `~/.claude/plugins/` and the
 * plugin keys inside a Claude Code settings.json. Field names and nesting
 * were taken from a live installation (Claude Code 2.1.273), not from the
 * documentation — `installed_plugins.json` wraps its map in a `plugins` key
 * under a `version: 2` envelope, and `known_marketplaces.json` does not.
 */
import type { ActivePlugin } from "../../../core/plugins";
import type { RawKnownMarketplace, SettingsScopeRead } from "../parser";
import type { PluginSettingsScope } from "../types";

/** An install record as `loadActivePlugins` returns it. */
export function install(
  qualifiedName: string,
  overrides: Partial<ActivePlugin> = {},
): ActivePlugin {
  const at = qualifiedName.lastIndexOf("@");
  const name = qualifiedName.slice(0, at);
  const marketplace = qualifiedName.slice(at + 1);
  return {
    name,
    marketplace,
    qualifiedName,
    installPath: `/Users/dev/.claude/plugins/cache/${marketplace}/${name}/1.0.0`,
    installScope: "user",
    manifest: { name, description: `${name} does things`, version: "1.0.0" },
    ...overrides,
  };
}

/** One settings file, already read. */
export function scope(
  s: PluginSettingsScope,
  data: Record<string, unknown> | null,
  error: string | null = null,
): SettingsScopeRead {
  const filePath =
    s === "global"
      ? "/Users/dev/.claude/settings.json"
      : s === "project"
        ? "/repo/.claude/settings.json"
        : s === "local"
          ? "/repo/.claude/settings.local.json"
          : "/Library/Application Support/ClaudeCode/managed-settings.json";
  return { scope: s, filePath, data, error };
}

/** The four scopes in precedence order, any of which may be absent. */
export function scopes(
  parts: Partial<Record<PluginSettingsScope, Record<string, unknown> | null>> = {},
): SettingsScopeRead[] {
  return (["global", "project", "local", "managed"] as const).map((s) =>
    scope(s, parts[s] ?? null),
  );
}

/** A `known_marketplaces.json` entry for a GitHub-hosted marketplace. */
export function marketplace(repo: string): RawKnownMarketplace {
  const name = repo.split("/")[1] ?? repo;
  return {
    source: { source: "github", repo },
    installLocation: `/Users/dev/.claude/plugins/marketplaces/${name}`,
    lastUpdated: "2026-09-16T06:03:52.405Z",
  };
}
