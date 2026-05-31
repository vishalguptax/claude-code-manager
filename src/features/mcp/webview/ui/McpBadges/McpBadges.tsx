/**
 * Small presentational badges for MCP server rows and the detail header, built
 * on the shared <Badge> primitive. Badge supplies the chrome (`.vsc-badge`);
 * the MCP-specific colour per transport/scope rides on a `mcp-badge-*` modifier
 * class in mcp.css, since the shared variants don't carry these distinct hues.
 */
import { Badge } from "../../../../../webview/shared/ui";
import type { McpServerScope, McpServerType } from "../../../types";

/** Transport-type badge (stdio / http). */
export function TypeBadge({ type }: { type: McpServerType }) {
  return <Badge text={type} variant="scope" class={`mcp-type-${type}`} />;
}

/** Configuration-scope badge (project / global / plugin). */
export function ScopeBadge({ scope }: { scope: McpServerScope }) {
  return <Badge text={scope} variant="scope" class={`mcp-scope-${scope}`} />;
}

/** "disabled" pill shown on rows whose server is explicitly disabled. */
export function DisabledBadge() {
  return <Badge text="disabled" variant="default" class="mcp-disabled-badge" />;
}

/** "read-only" pill shown on plugin-owned rows. */
export function ReadOnlyBadge({ pluginName }: { pluginName?: string }) {
  return (
    <Badge
      text="read-only"
      variant="default"
      class="mcp-readonly-badge"
      title={`Owned by plugin ${pluginName ?? ""}`}
    />
  );
}
