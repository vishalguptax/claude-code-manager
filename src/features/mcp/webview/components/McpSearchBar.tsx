/**
 * Search row for the MCP list: a debounce-free controlled search input with a
 * clear button, plus "browse community" and "refresh" side buttons. The parent
 * owns the query value (a signal) so this stays presentational.
 */
import { cx } from "../../../../webview/shared/lib";
import { Icon } from "../../../../webview/shared/ui";

export interface McpSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onBrowse: () => void;
  onRefresh: () => void;
}

export function McpSearchBar({ query, onQueryChange, onBrowse, onRefresh }: McpSearchBarProps) {
  return (
    <div class="search-row">
      <div class="feature-search">
        <input
          class="mcp-search-input"
          type="text"
          placeholder="Search servers..."
          aria-label="Search MCP servers"
          value={query}
          onInput={(e) => onQueryChange((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onQueryChange("");
          }}
        />
        <button
          type="button"
          class={cx("search-btn", !query && "is-hidden")}
          title="Clear (Esc)"
          aria-label="Clear search"
          onClick={() => onQueryChange("")}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      <button
        type="button"
        class="search-side-btn"
        title="Browse MCP servers (opens externally)"
        aria-label="Browse MCP servers"
        onClick={onBrowse}
      >
        <Icon name="globe" size={14} />
      </button>
      <button
        type="button"
        class="search-side-btn"
        title="Refresh MCP servers"
        aria-label="Refresh MCP servers"
        onClick={onRefresh}
      >
        <Icon name="refresh-cw" size={14} />
      </button>
    </div>
  );
}
