/**
 * Static registry of feature tabs surfaced in the v2 webview.
 */

export interface Feature {
  id: string;
  label: string;
  icon: string;
}

/**
 * Order is the order they appear in the TabBar. The front three are not a
 * frequency guess — this extension ships no telemetry, so there is no
 * usage data to rank tabs by — they are what the user who reported the
 * original problem named directly: Sessions is why the panel exists, and
 * Account and Config were the two tabs called out by name as important
 * and pushed out of reach when the four newest tabs were appended. Moving
 * both restores exactly what was reported broken, nothing more inferred.
 *
 * Everything from Skills onward is unchanged from before the four newest
 * tabs arrived, for the same no-data reason: ranking Checkpoints against
 * Hooks against Memory would be the identical mistake that buried Account
 * and Config, just aimed at a different set of tabs.
 *
 * This is only ever the DEFAULT. Any user can reorder or hide tabs from
 * the "Sidebar tabs" section of the Config tab, or by editing
 * claudeManager.tabOrder / claudeManager.hiddenTabs directly — so a
 * default that turns out wrong for someone costs them one drag, not a
 * re-release.
 */
export const TABS: readonly Feature[] = [
  { id: "sessions", label: "Sessions", icon: "message-square" },
  { id: "account", label: "Account", icon: "circle-user" },
  { id: "config", label: "Config", icon: "settings" },
  { id: "checkpoints", label: "Checkpoints", icon: "history" },
  { id: "prompts", label: "Prompts", icon: "pencil" },
  { id: "skills", label: "Skills", icon: "sparkles" },
  { id: "mcp", label: "MCP", icon: "plug" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "commands", label: "Commands", icon: "terminal-square" },
  { id: "hooks", label: "Hooks", icon: "webhook" },
  { id: "plugins", label: "Plugins", icon: "package" },
  { id: "memory", label: "Memory", icon: "brain" },
] as const;
