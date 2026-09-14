/**
 * The command palette. One search across every tab, on Cmd/Ctrl+K.
 *
 * Items come from the shared registry (shared/model/palette), which features
 * push into — the palette never imports a feature. Tab navigation is always
 * present, including for tabs that have not mounted yet and so have no items
 * to offer.
 *
 * Keyboard is the whole point of this surface, so it is the part that is
 * specified rather than inferred: Cmd/Ctrl+K opens and closes, ↑/↓ move,
 * Home/End jump, Enter runs, Escape closes. The list is a `listbox` with
 * `aria-activedescendant`, which keeps focus in the input — moving DOM focus
 * to each row instead would stop the user typing.
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { cx } from "../../shared/lib";
import { collectPaletteItems, type PaletteItem } from "../../shared/model/palette";
import { Icon } from "../../shared/ui";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => (open ? collectPaletteItems(query) : []), [open, query]);

  // Reset per opening, not per query: reopening should feel like a fresh
  // palette rather than resuming someone else's half-typed search.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  // A narrowing query can leave the cursor past the end of the results.
  useEffect(() => {
    setActive((i) => (i >= items.length ? 0 : i));
  }, [items.length]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const run = (item: PaletteItem | undefined): void => {
    if (!item) return;
    // Close first: an action that switches tabs should not run behind a
    // palette that is still covering the panel.
    onClose();
    item.run();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (items.length ? (i + 1) % items.length : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(Math.max(0, items.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        run(items[active]);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  // Groups are contiguous in the collected order, so a heading is emitted
  // wherever the group changes rather than by re-grouping here.
  let lastGroup = "";

  return (
    <div
      class="palette-backdrop"
      // A press on the backdrop dismisses; a press inside the box must not.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="palette" role="dialog" aria-modal="true" aria-label="Search everything">
        <div class="palette-input-row">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            type="text"
            class="palette-input"
            placeholder="Search sessions, skills, commands, agents, servers…"
            aria-label="Search everything"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items.length ? `palette-item-${active}` : undefined}
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={onKeyDown}
          />
        </div>

        {items.length === 0 ? (
          <div class="palette-empty">No matches for “{query}”</div>
        ) : (
          <div class="palette-list" id="palette-list" role="listbox" ref={listRef}>
            {items.map((item, i) => {
              const heading = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <>
                  {heading ? (
                    <div class="palette-group" key={`g:${heading}`} role="presentation">
                      {heading}
                    </div>
                  ) : null}
                  <div
                    key={item.id}
                    id={`palette-item-${i}`}
                    data-index={i}
                    class={cx("palette-item", i === active && "active")}
                    role="option"
                    aria-selected={i === active}
                    // mousedown, not click: the input is focused, and a click
                    // would blur it first on some platforms.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      run(item);
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span class="palette-item-icon">
                      {item.icon ? <Icon name={item.icon} size={15} /> : null}
                    </span>
                    <span class="palette-item-text">
                      <span class="palette-item-title">{item.title}</span>
                      {item.subtitle ? <span class="palette-item-sub">{item.subtitle}</span> : null}
                    </span>
                    {item.hint ? <span class="palette-item-hint">{item.hint}</span> : null}
                  </div>
                </>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
