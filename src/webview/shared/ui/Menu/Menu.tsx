/**
 * Menu — a positioned popup menu that reproduces VS Code's own gear /
 * Command-Palette / right-click chrome: ~4px vertical padding, 6px×22px item
 * rows, per-item leading icon, right-aligned keybinding hint in the muted
 * description colour, section separators, hover = selection background, danger
 * rows, and disabled rows. Colour comes entirely from the `--vscode-menu-*`
 * theme vars via the `.vsc-menu` styles.
 *
 * This is the single menu primitive: <ContextMenu> delegates here so the
 * right-click menu and any overflow ("…") menu are pixel-identical and native.
 *
 * Behaviour (mirrors v1 contextMenu.ts):
 *   - opens at the given {x, y}, then flips left/up if it would overflow the
 *     viewport (measured after mount),
 *   - closes on outside click, Escape, or after a (non-disabled) item is chosen,
 *   - one menu open at a time — the owner controls `open`.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../Icon";

/** A single menu row. `separatorBefore` draws a divider above it. */
export interface MenuItem {
  label: string;
  /** Lucide icon name shown in the leading gutter. */
  icon?: string;
  /** Right-aligned shortcut hint, e.g. "⌘K" / "Ctrl+K". */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

export interface MenuProps {
  open: boolean;
  /** Viewport coordinate (clientX/clientY) the menu opens at. */
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  /** Extra class on the menu container (e.g. to widen a specific menu). */
  class?: string;
}

export function Menu({ open, x, y, items, onClose, class: cls }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Reset to the requested coordinate whenever the menu (re)opens.
  useEffect(() => {
    if (open) setPos({ left: x, top: y });
  }, [open, x, y]);

  // After paint, nudge the menu back inside the viewport if it overflows the
  // right/bottom edges. We always recompute from the requested {x,y} (not the
  // already-corrected value) and only set state when the corrected coordinate
  // differs, so there is no setState feedback loop.
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (r.right > window.innerWidth) left = Math.max(0, x - r.width);
    if (r.bottom > window.innerHeight) top = Math.max(0, y - r.height);
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
  }, [open, x, y]);

  // Close on outside click or Escape while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    // Defer the outside-click listener a tick so the same click that opened the
    // menu does not immediately close it.
    const id = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // Legacy `.ctx-*` class names ride alongside the native `.vsc-menu*` ones so
    // existing right-click call sites/tests (sessions ListView) keep matching
    // during the transition; both resolve to the same native styles.
    <div
      ref={ref}
      class={cls ? `vsc-menu ctx-menu ${cls}` : "vsc-menu ctx-menu"}
      role="menu"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
    >
      {items.map((item, i) => (
        <>
          {item.separatorBefore ? <div class="vsc-menu-sep ctx-sep" key={`sep-${i}`} /> : null}
          <div
            key={item.label}
            class={[
              "vsc-menu-item",
              "ctx-item",
              item.danger ? "danger del" : "",
              item.disabled ? "disabled" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="menuitem"
            aria-disabled={item.disabled ? "true" : undefined}
            tabIndex={item.disabled ? -1 : 0}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            <span class="vsc-menu-icon" aria-hidden="true">
              {item.icon ? <Icon name={item.icon} size={16} /> : null}
            </span>
            <span class="vsc-menu-label">{item.label}</span>
            {item.hint ? <span class="vsc-menu-hint">{item.hint}</span> : null}
          </div>
        </>
      ))}
    </div>
  );
}
