/**
 * Empty state shown when no MCP servers are configured at all. Explains where
 * config files live and offers the bundled catalog as the way to add one.
 *
 * Shape and spacing come from the shared <EmptyState>; this only supplies the
 * copy and the action, so an emptied MCP tab looks like an emptied Hooks or
 * Commands tab.
 */
import { Button, EmptyState } from "../../../../../webview/shared/ui";

export interface McpEmptyProps {
  onOpenCatalog: () => void;
}

export function McpEmpty({ onOpenCatalog }: McpEmptyProps) {
  return (
    <EmptyState
      icon="plug"
      title="No MCP servers configured"
      description={
        <>
          Servers are declared in JSON: <code>.mcp.json</code> in the project root, or{" "}
          <code>~/.claude/mcp.json</code> for every project. Each one needs a{" "}
          <code>command</code> to run (stdio) or a <code>url</code> to reach (http).
        </>
      }
    >
      <Button variant="secondary" iconName="package" onClick={onOpenCatalog}>
        Add from catalog
      </Button>
    </EmptyState>
  );
}
