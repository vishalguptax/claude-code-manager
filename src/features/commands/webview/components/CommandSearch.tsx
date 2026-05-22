/**
 * Search row for the commands list: a debounced text input with an inline
 * clear button and a refresh button. Pressing Escape clears the query.
 */
import { Icon } from "../../../../webview/components/Icon";
import { cx } from "../../../../webview/utils/classnames";

export interface CommandSearchProps {
  query: string;
  onQueryChange: (value: string) => void;
  onClear: () => void;
  onRefresh: () => void;
}

export function CommandSearch({ query, onQueryChange, onClear, onRefresh }: CommandSearchProps) {
  return (
    <div class="search-row">
      <div class="feature-search">
        <input
          class="input"
          type="text"
          placeholder="Search commands..."
          aria-label="Search commands"
          value={query}
          onInput={(e) => onQueryChange((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClear();
          }}
        />
        <button
          type="button"
          class={cx("search-btn", !query && "is-hidden")}
          title="Clear (Esc)"
          onClick={onClear}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      <button type="button" class="search-side-btn" title="Refresh commands" onClick={onRefresh}>
        <Icon name="refresh-cw" size={14} />
      </button>
    </div>
  );
}
