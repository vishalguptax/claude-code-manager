/**
 * The bundled MCP catalog as a full panel: search, one row per curated
 * server, and a link out to the wider community directory.
 *
 * Choosing a server hands it to the Add form rather than writing config here,
 * so the user reviews every field and picks a scope before anything lands on
 * disk. A server whose name is already configured is marked "added" and opens
 * its existing entry instead — adding it again would only collide on the name.
 */
import { useState } from "preact/hooks";
import {
  Badge,
  BackButton,
  Button,
  EmptyState,
  ListItem,
  SearchInput,
} from "../../../../../webview/shared/ui";
import { MCP_CATALOG, catalogAuthHint, filterCatalog, type McpCatalogEntry } from "../../lib";
import { TypeBadge } from "../McpBadges";

export interface McpCatalogProps {
  /** Names configured in any scope; their rows read "added". */
  configured: ReadonlySet<string>;
  onBack: () => void;
  onAdd: (entry: McpCatalogEntry) => void;
  /** Open the already-configured server of this name. */
  onOpenExisting: (name: string) => void;
  /** Open a vendor's setup page through the host. */
  onOpenUrl: (url: string) => void;
  /** Open the community directory for servers beyond the catalog. */
  onBrowseMore: () => void;
}

export function McpCatalog({
  configured,
  onBack,
  onAdd,
  onOpenExisting,
  onOpenUrl,
  onBrowseMore,
}: McpCatalogProps) {
  const [query, setQuery] = useState("");
  const entries = filterCatalog(MCP_CATALOG, query);

  return (
    <div class="panel">
      <BackButton onClick={onBack} label="MCP servers" />
      <div class="d-head">
        <div class="d-title">Add from catalog</div>
        <div class="d-subtitle">
          Official servers with verified settings. You review the config before it's saved.
        </div>
      </div>
      <div class="search-row">
        <SearchInput
          value={query}
          placeholder="Search catalog"
          ariaLabel="Search MCP catalog"
          onInput={setQuery}
        />
      </div>
      <div class="list">
        {entries.length === 0 ? (
          <EmptyState title="No matching servers" />
        ) : (
          entries.map((entry) => (
            <CatalogRow
              key={entry.name}
              entry={entry}
              added={configured.has(entry.name)}
              onAdd={onAdd}
              onOpenExisting={onOpenExisting}
              onOpenUrl={onOpenUrl}
            />
          ))
        )}
        <div class="mcp-catalog-more">
          <Button variant="ghost" iconName="external-link" onClick={onBrowseMore}>
            Find more servers
          </Button>
        </div>
      </div>
    </div>
  );
}

function CatalogRow({
  entry,
  added,
  onAdd,
  onOpenExisting,
  onOpenUrl,
}: {
  entry: McpCatalogEntry;
  added: boolean;
  onAdd: (entry: McpCatalogEntry) => void;
  onOpenExisting: (name: string) => void;
  onOpenUrl: (url: string) => void;
}) {
  const hint = catalogAuthHint(entry);
  return (
    <ListItem
      class="mcp-item"
      onClick={() => (added ? onOpenExisting(entry.name) : onAdd(entry))}
    >
      <div class="mcp-item-row1">
        <span class="mcp-item-name">{entry.title}</span>
        <Button
          variant="icon"
          iconName="external-link"
          class="item-copy-btn"
          title={`${entry.title} setup docs`}
          ariaLabel={`Open ${entry.title} setup docs`}
          onClick={(e) => {
            // The row itself adds the server.
            e.stopPropagation();
            onOpenUrl(entry.homepage);
          }}
        />
        {added ? (
          <Badge text="added" variant="status" title={`"${entry.name}" is already configured`} />
        ) : null}
        <TypeBadge type={entry.transport} />
      </div>
      <div class="mcp-catalog-desc">{entry.description}</div>
      {hint && !added ? <div class="mcp-catalog-hint">{hint}</div> : null}
    </ListItem>
  );
}
