/**
 * Search row for the agent list: a debounced text input with a clear button
 * and a refresh action. The input is controlled by the parent's query value;
 * Escape clears it.
 */
import { Icon } from "../../../../webview/shared/ui";
import { cx } from "../../../../webview/shared/lib";

export interface SearchBarProps {
  value: string;
  onInput: (value: string) => void;
  onRefresh: () => void;
}

export function SearchBar({ value, onInput, onRefresh }: SearchBarProps) {
  return (
    <div class="search-row">
      <div class="feature-search">
        <input
          class="input"
          type="text"
          placeholder="Search agents..."
          aria-label="Search agents"
          value={value}
          onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onInput("");
          }}
        />
        <button
          type="button"
          class={cx("search-btn", !value && "is-hidden")}
          title="Clear (Esc)"
          aria-label="Clear search"
          onClick={() => onInput("")}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      <button
        type="button"
        class="search-side-btn"
        title="Refresh agents"
        aria-label="Refresh agents"
        onClick={onRefresh}
      >
        <Icon name="refresh-cw" size={14} />
      </button>
    </div>
  );
}
