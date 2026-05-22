/**
 * Positioned context menu — a small Preact component rendered at a fixed
 * viewport coordinate, with per-item icons, danger styling, and separators.
 *
 * Why not `<vscode-context-menu>`: that element's `data` items carry only
 * label / keybinding / value / separator — no per-item icon, no danger
 * styling, and it does not anchor to an arbitrary click point. The v1 session
 * menu needs all three (pencil/pin/fork/copy icons, a red Delete row, and
 * open-at-cursor positioning), so we render our own menu against the existing
 * `.ctx-menu` / `.ctx-item` styles instead (verbatim v1 look).
 *
 * Behaviour mirrors v1 `contextMenu.ts`:
 *   - opens at the given {x, y}, then flips left/up if it would overflow the
 *     viewport (measured after mount via the post-render effect),
 *   - closes on outside click, Escape, or after an item is chosen,
 *   - one menu open at a time (the owner controls `open`).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../Icon";

/** A single actionable row. `separatorBefore` draws a divider above it. */
export interface ContextMenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

export interface ContextMenuProps {
  open: boolean;
  /** Viewport coordinate (clientX/clientY) the menu opens at. */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Reset to the requested coordinate whenever the menu (re)opens.
  useEffect(() => {
    if (open) setPos({ left: x, top: y });
  }, [open, x, y]);

  // After paint, nudge the menu back inside the viewport if it overflows the
  // right/bottom edges — same correction v1 did via requestAnimationFrame. We
  // always recompute from the requested {x,y} (not the already-corrected value)
  // and only set state when the corrected coordinate actually differs, so there
  // is no setState feedback loop.
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
    <div
      ref={ref}
      class="ctx-menu"
      role="menu"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
    >
      {items.map((item, i) => (
        <>
          {item.separatorBefore ? <div class="ctx-sep" key={`sep-${i}`} /> : null}
          <div
            key={item.label}
            class={item.danger ? "ctx-item del" : "ctx-item"}
            role="menuitem"
            tabIndex={0}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.icon ? (
              <span class="ctx-icon">
                <Icon name={item.icon} size={14} />
              </span>
            ) : null}
            {item.label}
          </div>
        </>
      ))}
    </div>
  );
}
