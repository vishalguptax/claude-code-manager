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

/**
 * Which of the shared scope-badge colours a plugin scope borrows, so the chip
 * on a plugin row is the same hue as the Skills / Hooks / MCP chip for the
 * same settings file. `managed` is the administrator's policy file — not a
 * scope the user owns — so it takes the `builtin` tone the other tabs already
 * use for "this one is not yours to edit".
 */
export function scopeTone(
  scope: PluginSettingsScope,
): "global" | "project" | "local" | "builtin" {
  return scope === "managed" ? "builtin" : scope;
}

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
      return "On your plugin blocklist, so Claude Code will not load it.";
    case "orphaned":
      return `Listed in ${SCOPE_LABEL[plugin.decidedBy ?? "global"]} settings, but no copy is installed.`;
    case "not-enabled":
      return "Installed, but nothing enables it, so Claude Code is not loading it.";
    case "enabled":
      return `Enabled in ${SCOPE_LABEL[plugin.decidedBy ?? "global"]} settings.`;
    case "disabled":
      return `Disabled in ${SCOPE_LABEL[plugin.decidedBy ?? "global"]} settings.`;
  }
}

/** One settings file's opinion about a plugin, ready to render as a chip. */
export interface OverrideStep {
  /** Scope name in Claude Code's own vocabulary — "user", "project", … */
  scope: string;
  /** What that file says: "on" or "off". */
  state: string;
  /** Whether this is the file Claude Code actually obeyed. */
  winner: boolean;
}

/**
 * The override chain, one chip per settings file, lowest precedence first —
 * "user: on", "project: off", "local: on". Empty when at most one scope has an
 * opinion: there is no conflict to explain, and a single chip repeating the
 * summary line above it is noise.
 */
export function overrideSteps(plugin: PluginEntry): OverrideStep[] {
  if (plugin.declaredIn.length < 2) return [];
  return plugin.declaredIn.map((d) => ({
    scope: SCOPE_LABEL[d.scope],
    state: d.enabled ? "on" : "off",
    winner: d.scope === plugin.decidedBy,
  }));
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

/** Whether a row's toggle should be offered at all. */
export function canToggle(plugin: PluginEntry): boolean {
  return plugin.status !== "blocked" && toggleScope(plugin) !== null;
}

/**
 * Why a plugin cannot be switched from here. Empty when it can — the caller
 * uses that to decide whether to render the note at all.
 */
export function readOnlyReason(plugin: PluginEntry): string {
  if (plugin.status === "blocked") {
    return "On your plugin blocklist, so it cannot be turned on from here.";
  }
  if (plugin.decidedBy === "managed") {
    return "Set by managed settings, which the sidebar cannot write to.";
  }
  return "";
}

/** Shortest useful description of where a marketplace comes from. */
export function sourceSummary(sourceKind: string, sourceLabel: string): string {
  if (sourceLabel === "") return sourceKind === "" ? "source unknown" : sourceKind;
  return sourceKind === "github" ? sourceLabel : `${sourceKind}: ${sourceLabel}`;
}
