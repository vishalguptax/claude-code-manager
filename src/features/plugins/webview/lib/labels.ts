/**
 * Turning the parser's flags into the words a row shows.
 *
 * Kept out of the components because it is where the feature's whole point
 * lives: "installed, never enabled" has to read as a finding rather than as
 * a shrug, and that phrasing is worth testing directly.
 */
import type {
  MarketplaceTrust,
  PluginEntry,
  PluginSettingsScope,
  PluginStatus,
} from "../../types";

/**
 * Scope names as Claude Code's own docs say them. The extension elsewhere
 * badges `~/.claude/settings.json` as "global"; Claude Code calls that file
 * the *user* settings, and this tab quotes settings keys verbatim, so it
 * uses Claude Code's word to avoid sending someone to the wrong file.
 */
export const SCOPE_LABEL: Record<PluginSettingsScope, string> = {
  global: "user",
  project: "project",
  local: "local",
  managed: "managed",
};

/** Short chip text for a plugin's state. */
export const STATUS_LABEL: Record<PluginStatus, string> = {
  enabled: "enabled",
  disabled: "disabled",
  "not-enabled": "not enabled",
  orphaned: "no install",
  blocked: "blocked",
};

/** Which `<Badge>` variant carries each state's weight. */
export function statusVariant(status: PluginStatus): "status" | "danger" | "default" {
  if (status === "blocked") return "danger";
  if (status === "orphaned" || status === "not-enabled") return "status";
  return "default";
}

/** Chip text for a marketplace's trust. */
export const TRUST_LABEL: Record<MarketplaceTrust, string> = {
  official: "official",
  allowlisted: "allowed",
  unlisted: "not allowed",
  blocked: "blocked",
  known: "known",
  unknown: "unregistered",
};

/** Trust levels a user needs to act on. */
export function trustVariant(trust: MarketplaceTrust): "status" | "danger" | "default" {
  if (trust === "blocked" || trust === "unlisted") return "danger";
  if (trust === "unknown") return "status";
  return "default";
}

/**
 * The one-line explanation under a plugin's name: why it is in this state,
 * and which file to open to change it.
 */
export function stateSummary(plugin: PluginEntry): string {
  switch (plugin.status) {
    case "blocked":
      return "Blocked by ~/.claude/plugins/blocklist.json — Claude Code will not load it.";
    case "orphaned":
      return `Listed in ${SCOPE_LABEL[plugin.decidedBy ?? "global"]} settings, but no copy is installed.`;
    case "not-enabled":
      return "Installed, but no settings file enables it — Claude Code is not loading it.";
    case "enabled":
      return `Enabled in ${SCOPE_LABEL[plugin.decidedBy ?? "global"]} settings.`;
    case "disabled":
      return `Disabled in ${SCOPE_LABEL[plugin.decidedBy ?? "global"]} settings.`;
  }
}

/**
 * How a row spells out an override chain, e.g.
 * "user: on › project: off › local: on". Empty when at most one scope has
 * an opinion — there is no conflict to explain.
 */
export function overrideChain(plugin: PluginEntry): string {
  if (plugin.declaredIn.length < 2) return "";
  return plugin.declaredIn
    .map((d) => `${SCOPE_LABEL[d.scope]}: ${d.enabled ? "on" : "off"}`)
    .join(" › ");
}

/**
 * Which settings file a row's toggle writes to.
 *
 * The scope that currently decides the plugin, so flipping the switch
 * actually changes the outcome — writing `false` into user settings while
 * the project file says `true` would leave the plugin on and look broken.
 * `managed` is not writable, and a plugin nobody has an opinion about starts
 * at the user scope.
 */
export function toggleScope(plugin: PluginEntry): PluginSettingsScope | null {
  if (plugin.decidedBy === "managed") return null;
  return plugin.decidedBy ?? "global";
}

/** Whether a row's switch should be offered at all. */
export function canToggle(plugin: PluginEntry): boolean {
  return plugin.status !== "blocked" && toggleScope(plugin) !== null;
}

/** Shortest useful description of where a marketplace comes from. */
export function sourceSummary(sourceKind: string, sourceLabel: string): string {
  if (sourceLabel === "") return sourceKind === "" ? "source unknown" : sourceKind;
  return sourceKind === "github" ? sourceLabel : `${sourceKind}: ${sourceLabel}`;
}
