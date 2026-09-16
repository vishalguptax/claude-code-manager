/**
 * Static registry of feature tabs surfaced in the v2 webview.
 */

export interface Feature {
  id: string;
  label: string;
  icon: string;
}

/**
 * Order is the order they appear in the TabBar, and it groups by what the
 * user is doing rather than by when the tab was written:
 *
 *   what happened   — Sessions, Checkpoints, Prompts
 *   what Claude has — Skills, MCP, Agents, Commands, Hooks, Plugins
 *   what it knows   — Memory
 *   who you are     — Account, Config
 *
 * The five original tabs keep their relative order so existing muscle
 * memory still works; the new ones were appended in build order, which
 * put file history and prompt history nowhere near the sessions they
 * belong to.
 */
export const TABS: readonly Feature[] = [
  { id: "sessions", label: "Sessions", icon: "message-square" },
  { id: "checkpoints", label: "Checkpoints", icon: "history" },
  { id: "prompts", label: "Prompts", icon: "pencil" },
  { id: "skills", label: "Skills", icon: "sparkles" },
  { id: "mcp", label: "MCP", icon: "plug" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "commands", label: "Commands", icon: "terminal-square" },
  { id: "hooks", label: "Hooks", icon: "webhook" },
  { id: "plugins", label: "Plugins", icon: "package" },
  { id: "memory", label: "Memory", icon: "brain" },
  { id: "account", label: "Account", icon: "circle-user" },
  { id: "config", label: "Config", icon: "settings" },
] as const;
