/**
 * Debounced search field — a <TextField> with a leading magnifier icon and a
 * trailing clear (x) button, generalising the per-feature search rows
 * (v1 `searchBar.ts`, McpSearchBar, CommandSearch, agents SearchBar).
 *
 * The leading icon and clear button ride in the native element's
 * `content-before` / `content-after` slots, so they sit inside the input
 * chrome exactly like VS Code's own search fields rather than floating beside
 * a separate box.
 *
 * Controlled value, debounced emit: the visible text updates instantly off
 * local state for a responsive caret, while `onInput` fires `debounceMs` after
 * the last keystroke so the (potentially expensive) consumer filter/scan runs
 * once per pause. Clearing and Escape emit immediately. The parent's `value`
 * is the source of truth — when it changes externally (e.g. a reset), the
 * local mirror re-syncs.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { TextField } from "../TextField";

export interface SearchInputProps {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  /** Debounce window in ms before `onInput` fires. Default 200. */
  debounceMs?: number;
  ariaLabel?: string;
}

export function SearchInput({
  value,
  onInput,
  placeholder,
  debounceMs = 200,
  ariaLabel,
}: SearchInputProps) {
  // Local mirror so the caret stays responsive while the debounce is pending.
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Re-sync when the controlled value changes from outside (e.g. external reset).
  useEffect(() => {
    setLocal(value);
  }, [value]);

  // Clear any pending debounce on unmount.
  useEffect(() => () => clearTimeout(timer.current), []);

  const emit = (next: string, immediate: boolean): void => {
    setLocal(next);
    clearTimeout(timer.current);
    if (immediate || debounceMs <= 0) {
      onInput(next);
      return;
    }
    timer.current = setTimeout(() => onInput(next), debounceMs);
  };

  const clear = (): void => emit("", true);

  return (
    <TextField
      value={local}
      type="search"
      onInput={(v) => emit(v, false)}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      class="vsc-search"
      contentBefore={
        <span class="vsc-search-icon" aria-hidden="true">
          <Icon name="search" size={14} />
        </span>
      }
      contentAfter={
        local ? (
          <button
            type="button"
            class="vsc-search-clear"
            title="Clear (Esc)"
            aria-label="Clear search"
            onClick={clear}
          >
            <Icon name="x" size={14} />
          </button>
        ) : null
      }
    />
  );
}
