/**
 * Static registry of feature tabs surfaced in the v2 webview.
 */

export interface Feature {
  id: string;
  label: string;
  icon: string;
}

/**
 * Order is the order they appear in the TabBar. Sessions is first because
 * it is the reason the panel exists; Account is second because checking
 * quota is done as often as browsing sessions, confirmed directly rather
 * than guessed. Everything from Skills onward is otherwise unchanged from
 * before the four newest tabs arrived — this extension ships no
 * telemetry, so there is no usage data to justify ranking Checkpoints
 * against Hooks against Memory, and guessing at one is exactly the
 * mistake that made Account and Config hard to reach in the first place.
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
  { id: "checkpoints", label: "Checkpoints", icon: "history" },
  { id: "prompts", label: "Prompts", icon: "pencil" },
  { id: "skills", label: "Skills", icon: "sparkles" },
  { id: "mcp", label: "MCP", icon: "plug" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "commands", label: "Commands", icon: "terminal-square" },
  { id: "hooks", label: "Hooks", icon: "webhook" },
  { id: "plugins", label: "Plugins", icon: "package" },
  { id: "memory", label: "Memory", icon: "brain" },
  { id: "config", label: "Config", icon: "settings" },
] as const;
