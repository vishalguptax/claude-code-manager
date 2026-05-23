/**
 * Pure helpers for the MCP feature slice — no JSX, no signals, no DOM. These
 * back the views (grouping, row flattening, connection previews, value
 * masking) and are unit-tested in isolation.
 */
import type { McpServer } from "../../types";

/**
 * Default community MCP directory. The v1 host could override this from
 * settings, but that plumbing lives in the sessions monolith; until F3
 * rewires it, the tab opens the default directory.
 */
export const MCP_BROWSE_URL = "https://mcp.so";

/** Max characters shown in a row's single-line connection preview. */
const PREVIEW_MAX = 60;

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

/** Build the single-line connection preview for a server row. */
export function connectionPreview(server: McpServer): string {
  const detail =
    server.type === "http"
      ? (server.url ?? "")
      : [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
  return detail.length > PREVIEW_MAX ? `${detail.slice(0, PREVIEW_MAX)}...` : detail;
}

/**
 * Mask a sensitive value, keeping the first 4 and last 4 characters. Values
 * of 8 characters or fewer are fully masked.
 */
export function maskSensitiveValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
