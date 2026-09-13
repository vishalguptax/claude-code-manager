/**
 * Pure helpers for the MCP feature slice — no JSX, no signals, no DOM. These
 * back the views (grouping, row flattening, connection previews, value
 * masking) and are unit-tested in isolation.
 */
import type { McpServer } from "../../types";

/** Default community MCP directory the "Browse" action opens. */
export const MCP_BROWSE_URL = "https://mcp.so";

/** Group label for a server in the list view. */
export function groupLabel(server: McpServer): string {
  if (server.scope === "project") return "Project Servers";
  if (server.scope === "plugin") return `Plugin: ${server.pluginName ?? "unknown"}`;
  return "Global Servers";
}

/** A flat list entry: either a group header or a server row. */
export type Row = { kind: "label"; label: string } | { kind: "item"; server: McpServer };

/** Flatten servers (already sorted) into label + item rows in display order. */
export function buildRows(list: McpServer[]): Row[] {
  const rows: Row[] = [];
  let lastLabel: string | null = null;
  for (const server of list) {
    const label = groupLabel(server);
    if (label !== lastLabel) {
      rows.push({ kind: "label", label });
      lastLabel = label;
    }
    rows.push({ kind: "item", server });
  }
  return rows;
}

/** True for URL-based transports (http/sse/ws) as opposed to stdio. */
export function isUrlTransport(server: Pick<McpServer, "type">): boolean {
  return server.type !== "stdio";
}

/**
 * Build the single-line connection preview for a server row.
 *
 * Returns the FULL string. It used to be cut at 60 characters here, which
 * clipped mid-token regardless of how wide the sidebar actually was — too
 * early at 420px, still too long at 280px — and then `.mcp-item-detail`
 * ellipsized whatever survived, so the row was truncated twice. CSS does it
 * once, at the real edge; the full value goes in the row's title attribute.
 */
export function connectionPreview(server: McpServer): string {
  return isUrlTransport(server)
    ? (server.url ?? "")
    : [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
}

/**
 * Mask a sensitive value, keeping the first 4 and last 4 characters. Values
 * of 8 characters or fewer are fully masked.
 */
export function maskSensitiveValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
