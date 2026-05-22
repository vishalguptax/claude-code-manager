/**
 * Empty state shown when no MCP servers are configured at all. Explains where
 * config files live and offers a "browse community" link.
 */
export interface McpEmptyProps {
  onBrowse: () => void;
}

export function McpEmpty({ onBrowse }: McpEmptyProps) {
  return (
    <div class="mcp-empty">
      <div class="mcp-empty-title">No MCP servers configured</div>
      <div class="mcp-empty-desc">
        MCP servers are defined in JSON config files:
        <br />
        <code>.mcp.json</code> (project root)
        <br />
        <code>~/.claude/mcp.json</code> (global)
        <br />
        <br />
        Each server has a <code>command</code> (stdio) or <code>url</code> (http) transport.
      </div>
      <button type="button" class="empty-link-btn" onClick={onBrowse}>
        Browse MCP servers →
      </button>
    </div>
  );
}
