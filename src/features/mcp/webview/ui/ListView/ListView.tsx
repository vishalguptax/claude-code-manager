/**
 * MCP servers list view. Renders the shared SearchInput, the shared ScopeFilter
 * (with two side actions — browse community + refresh), and the server list
 * grouped by scope. Selecting a row drives the detail view via the `selected`
 * signal. Large lists (>50 rows) render through the shared VirtualList with
 * group-label rows interleaved into a single flat sequence.
 */
import type { ComponentChildren } from "preact";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Icon,
  ScopeFilter,
  SearchInput,
  VirtualList,
} from "../../../../../webview/shared/ui";
import { type Row, buildRows } from "../../lib";
import type { McpServer } from "../../../types";
import {
  type McpScopeFilter,
  authNeeds,
  filteredServers,
  parseErrors,
  scopeCounts,
  scopeFilter,
  searchQuery,
  selected,
  servers,
} from "../../model";
import { McpEmpty } from "../McpEmpty";
import { McpItem } from "../McpItem";

/** Threshold above which the list windows its rows for scroll performance. */
const VIRTUAL_THRESHOLD = 50;
/** Fixed row height (px) used by the virtualized renderer. Must match CSS. */
const ROW_HEIGHT = 48;

export interface ListViewProps {
  onSelect: (server: McpServer) => void;
  onCopyName: (name: string) => void;
  onBrowse: () => void;
  onRefresh: () => void;
  onNew: () => void;
  /** Open Claude's /mcp panel — the surface where flagged connectors re-auth. */
  onReauth: () => void;
}

export function ListView({
  onSelect,
  onCopyName,
  onBrowse,
  onRefresh,
  onNew,
  onReauth,
}: ListViewProps) {
  const all = servers.value;
  const filtered = filteredServers.value;
  const query = searchQuery.value;
  const sel = selected.value;
  const counts = scopeCounts.value;

  const scopeOptions: { value: McpScopeFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: all.length },
    { value: "project", label: "Project", count: counts.project },
    { value: "global", label: "Global", count: counts.global },
  ];
  if (counts.plugin > 0) {
    scopeOptions.push({ value: "plugin", label: "Plugin", count: counts.plugin });
  }

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
    body = <EmptyState title={query ? "No matching servers" : "No servers found"} />;
  } else {
    const rows = buildRows(filtered);
    const count = (
      <div class="list-count">
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
                active={sel?.name === row.server.name && sel?.scope === row.server.scope}
                onSelect={onSelect}
                onCopyName={onCopyName}
              />
            ),
          )}
        </>
      );
  }

  const needs = authNeeds.value;

  return (
    <div class="panel">
      <ErrorBanner errors={parseErrors.value} />
      {needs.length > 0 ? (
        // Actionable banner: these are Claude's claude.ai connectors (from the
        // re-auth cache), NOT the configured servers listed below — they have no
        // row here, so the banner is the only handle. Clicking opens the /mcp
        // panel, the surface where each connector is actually re-authenticated.
        <button
          type="button"
          class="mcp-auth-banner"
          onClick={onReauth}
          title={`Open Claude's /mcp panel to re-authenticate:\n${needs.join(", ")}`}
          aria-label={`${needs.length} ${needs.length === 1 ? "connector needs" : "connectors need"} re-auth. Open the /mcp panel to fix.`}
        >
          <Icon name="circle-alert" size={14} />
          <span class="mcp-auth-banner-text">
            <strong>
              {needs.length} {needs.length === 1 ? "connector needs" : "connectors need"} re-auth
            </strong>
            <span class="mcp-auth-banner-names">{needs.join(", ")}</span>
          </span>
          <span class="mcp-auth-banner-go" aria-hidden="true">
            Open /mcp
          </span>
        </button>
      ) : null}
      <div class="search-row">
        <SearchInput
          value={query}
          placeholder="Search servers..."
          ariaLabel="Search MCP servers"
          onInput={(v) => {
            searchQuery.value = v.toLowerCase();
          }}
        />
        <Button
          variant="icon"
          iconName="plus"
          class="search-side-btn"
          title="Add MCP server"
          ariaLabel="Add MCP server"
          onClick={onNew}
        />
        <Button
          variant="icon"
          iconName="globe"
          class="search-side-btn"
          title="Browse MCP servers (opens externally)"
          ariaLabel="Browse MCP servers"
          onClick={onBrowse}
        />
        <Button
          variant="icon"
          iconName="refresh-cw"
          class="search-side-btn"
          title="Refresh MCP servers"
          ariaLabel="Refresh MCP servers"
          onClick={onRefresh}
        />
      </div>
      {all.length > 0 ? (
        <ScopeFilter<McpScopeFilter>
          value={scopeFilter.value}
          options={scopeOptions}
          onChange={(s) => {
            scopeFilter.value = s;
          }}
        />
      ) : null}
      <div class="list">{body}</div>
    </div>
  );
}
