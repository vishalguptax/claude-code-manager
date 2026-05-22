/**
 * MCP servers list view. Renders the search bar, scope filter, and the
 * server list grouped by scope. Selecting a row drives the detail view via
 * the `selected` signal. Large lists (>50 rows) render through the shared
 * VirtualList with group-label rows interleaved into a single flat sequence.
 */
import type { ComponentChildren } from "preact";
import { VirtualList } from "../../../../webview/shared/ui";
import type { McpServer } from "../../types";
import { McpEmpty } from "../components/McpEmpty";
import { McpItem } from "../components/McpItem";
import { McpSearchBar } from "../components/McpSearchBar";
import { ScopeFilter } from "../components/ScopeFilter";
import {
  filteredServers,
  groupLabel,
  scopeCounts,
  scopeFilter,
  searchQuery,
  selected,
  servers,
} from "../signals";

/** Threshold above which the list windows its rows for scroll performance. */
const VIRTUAL_THRESHOLD = 50;
/** Fixed row height (px) used by the virtualized renderer. Must match CSS. */
const ROW_HEIGHT = 48;

/** A flat list entry: either a group header or a server row. */
type Row = { kind: "label"; label: string } | { kind: "item"; server: McpServer };

/** Flatten the filtered servers into label + item rows in display order. */
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

export interface ListViewProps {
  onSelect: (server: McpServer) => void;
  onCopyName: (name: string) => void;
  onBrowse: () => void;
  onRefresh: () => void;
}

export function ListView({ onSelect, onCopyName, onBrowse, onRefresh }: ListViewProps) {
  const all = servers.value;
  const filtered = filteredServers.value;
  const query = searchQuery.value;
  const sel = selected.value;
  const counts = scopeCounts.value;

  const renderRow = (row: Row) =>
    row.kind === "label" ? (
      <div class="mcp-group-label">{row.label}</div>
    ) : (
      <McpItem
        server={row.server}
        active={sel?.name === row.server.name && sel?.scope === row.server.scope}
        onSelect={onSelect}
        onCopyName={onCopyName}
      />
    );

  let body: ComponentChildren;
  if (all.length === 0) {
    body = <McpEmpty onBrowse={onBrowse} />;
  } else if (filtered.length === 0) {
    body = <div class="empty">{query ? "No matching servers" : "No servers found"}</div>;
  } else {
    const rows = buildRows(filtered);
    const count = (
      <div class="mcp-list-count">
        {filtered.length} server{filtered.length !== 1 ? "s" : ""}
      </div>
    );
    body =
      filtered.length > VIRTUAL_THRESHOLD ? (
        <>
          {count}
          <VirtualList<Row>
            class="mcp-virtual"
            items={rows}
            itemHeight={ROW_HEIGHT}
            renderItem={(row) => renderRow(row)}
          />
        </>
      ) : (
        <>
          {count}
          {rows.map((row) =>
            row.kind === "label" ? (
              <div class="mcp-group-label" key={`label-${row.label}`}>
                {row.label}
              </div>
            ) : (
              <McpItem
                key={`${row.server.scope}:${row.server.pluginName ?? ""}:${row.server.name}`}
                server={row.server}
                active={
                  sel?.name === row.server.name && sel?.scope === row.server.scope
                }
                onSelect={onSelect}
                onCopyName={onCopyName}
              />
            ),
          )}
        </>
      );
  }

  return (
    <div class="panel">
      <McpSearchBar
        query={query}
        onQueryChange={(v) => {
          searchQuery.value = v.toLowerCase();
        }}
        onBrowse={onBrowse}
        onRefresh={onRefresh}
      />
      {all.length > 0 ? (
        <ScopeFilter
          active={scopeFilter.value}
          total={all.length}
          counts={counts}
          onChange={(s) => {
            scopeFilter.value = s;
          }}
        />
      ) : null}
      <div class="list">{body}</div>
    </div>
  );
}
