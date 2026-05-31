/**
 * Themed single-select dropdown — a custom trigger button + the shared <Menu>
 * popup, giving full control over width, height, and native look.
 *
 * Why not the `<vscode-single-select>` web component (the previous internals):
 * its Shadow DOM face renders at an intrinsic ~26px and exposes no ::part or
 * height prop, so it always looked too small/narrow next to our 32px controls
 * and could not be widened to match the search field. A custom trigger lets us
 * own the box exactly — full-width, --h-control tall, settings-dropdown chrome —
 * and reuse the already-native <Menu> for the open list (same chrome as the
 * gear / right-click menus), instead of maintaining a second popup style.
 *
 * The public API is unchanged ({ value, options:{value,label,badge?,marker?}[],
 * onChange, icon?, ariaLabel? }) so every call site (sessions project/branch,
 * config settings) keeps working:
 *   - `badge`  → trailing muted count on the menu row (Menu's `hint` slot).
 *   - `marker` → short annotation appended to the label, e.g. "current".
 *   - `icon`   → leading glyph on the closed trigger (e.g. git-branch).
 *   - the selected option is marked in the menu with a leading check glyph.
 *
 * Width: the trigger fills its container (100%); the popup opens flush under the
 * trigger and is at least as wide as the trigger (via --dropdown-trigger-width).
 *
 * Keyboard: Enter / Space / ArrowDown open the menu (focusing the current
 * option); Escape closes it; arrow navigation + selection inside the open list
 * is handled by <Menu>. The trigger is a normal focusable button.
 */

import { useRef, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { Menu, type MenuItem } from "../Menu";

/** One selectable row. `badge` shows as a trailing muted count; `marker` annotates the label. */
export interface DropdownOption {
  value: string;
  label: string;
  /** Trailing count/label drawn muted after the option text. */
  badge?: string | number;
  /** Short annotation appended to the label, e.g. "current". */
  marker?: string;
}

export interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Optional leading icon name (Lucide), placed left of the trigger label. */
  icon?: string;
  /** Accessible label for screen readers. */
  ariaLabel?: string;
  title?: string;
  class?: string;
}

export function Dropdown({
  value,
  options,
  onChange,
  icon,
  ariaLabel,
  title,
  class: cls,
}: DropdownProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  // Menu anchors at a viewport coordinate; we capture the trigger's rect when
  // opening so the popup lands flush under its left edge, and set the popup's
  // min-width to the trigger width via a CSS var on the wrapper.
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0 });

  const selected = options.find((o) => o.value === value);
  const triggerLabel = selected
    ? selected.marker
      ? `${selected.label} (${selected.marker})`
      : selected.label
    : "";

  const openMenu = (): void => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Open 2px below the trigger so the popup edge clears the trigger border.
    setAnchor({ x: r.left, y: r.bottom + 2, width: r.width });
    setOpen(true);
  };

  const toggle = (): void => {
    if (open) setOpen(false);
    else openMenu();
  };

  const onTriggerKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu();
    }
  };

  // Each option becomes a Menu row. The selected row carries a leading check
  // glyph; `badge` rides in the right-aligned `hint` slot as a muted count.
  const items: MenuItem[] = options.map((o) => ({
    label: o.marker ? `${o.label} (${o.marker})` : o.label,
    icon: o.value === value ? "check" : undefined,
    hint: o.badge !== undefined ? String(o.badge) : undefined,
    onSelect: () => {
      if (o.value !== value) onChange(o.value);
    },
  }));

  return (
    <div
      class={cls ? `vsc-dropdown ${cls}` : "vsc-dropdown"}
      style={anchor.width ? { "--dropdown-trigger-width": `${anchor.width}px` } : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        class="vsc-dropdown-trigger"
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
      >
        {icon ? (
          <span class="vsc-dropdown-leading" aria-hidden="true">
            <Icon name={icon} size={13} />
          </span>
        ) : null}
        <span class="vsc-dropdown-label">{triggerLabel}</span>
        <span class="vsc-dropdown-chevron" aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      <Menu
        open={open}
        x={anchor.x}
        y={anchor.y}
        items={items}
        onClose={() => setOpen(false)}
        class="vsc-dropdown-menu"
        // Exclude the trigger from outside-press dismissal so re-clicking it
        // toggles closed cleanly (the trigger's onClick owns the open state);
        // without this the document listener would close on pointerdown and the
        // click would immediately reopen — the reported close/reopen flicker.
        anchorRef={triggerRef}
      />
    </div>
  );
}
