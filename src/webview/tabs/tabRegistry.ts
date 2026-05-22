/**
 * Static registry of feature tabs surfaced in the v2 webview. Order is the
 * order they appear in the TabBar.
 */

export interface Feature {
  id: string;
  label: string;
  icon: string;
}

export const TABS: readonly Feature[] = [
  { id: "sessions", label: "Sessions", icon: "message-square" },
  { id: "skills", label: "Skills", icon: "sparkles" },
  { id: "commands", label: "Commands", icon: "terminal-square" },
  { id: "hooks", label: "Hooks", icon: "webhook" },
  { id: "mcp", label: "MCP", icon: "plug" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "account", label: "Account", icon: "circle-user" },
  { id: "config", label: "Config", icon: "settings" },
] as const;
