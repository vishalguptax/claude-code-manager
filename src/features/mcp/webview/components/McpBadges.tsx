/**
 * Small presentational badges for MCP server rows and the detail header.
 * Pure functions of their props; all colour comes from CSS classes.
 */
import type { McpServer, McpServerScope, McpServerType } from "../../types";

/** Transport-type badge (stdio / http). */
export function TypeBadge({ type }: { type: McpServerType }) {
  return <span class={`mcp-type-badge mcp-type-${type}`}>{type}</span>;
}

/** Configuration-scope badge (project / global / plugin). */
export function ScopeBadge({ scope }: { scope: McpServerScope }) {
  return <span class={`mcp-scope-badge mcp-scope-${scope}`}>{scope}</span>;
}

/** "disabled" pill shown on rows whose server is explicitly disabled. */
export function DisabledBadge() {
  return <span class="mcp-disabled-badge">disabled</span>;
}

/** "read-only" pill shown on plugin-owned rows. */
export function ReadOnlyBadge({ pluginName }: { pluginName?: string }) {
  return (
    <span class="mcp-readonly-badge" title={`Owned by plugin ${pluginName ?? ""}`}>
      read-only
    </span>
  );
}
