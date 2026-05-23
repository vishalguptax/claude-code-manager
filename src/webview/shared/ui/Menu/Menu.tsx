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

/** Gap kept between a corrected menu edge and the viewport edge (px). */
const VIEWPORT_GUTTER = 8;

/**
 * Position a menu of size {w, h} opened at {x, y} so it stays fully inside a
 * {vw, vh} viewport. Pure so the overflow/clamp behaviour is unit-testable
 * without a layout pass (jsdom/happy-dom don't flush layout-effect re-renders).
 *
 * Horizontal: flip left of the anchor if the right edge overflows, then HARD
 * clamp into [GUTTER, vw - w - GUTTER] so a menu wider than expected still can't
 * spill off a narrow sidebar. Math.max wins when the menu is too wide to fully
 * fit, pinning it to the left gutter. Vertical: flip above the anchor if the
 * bottom overflows, never going above 0.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  let left = x;
  let top = y;
  if (x + w > vw) left = x - w;
  if (y + h > vh) top = Math.max(0, y - h);
  left = Math.max(VIEWPORT_GUTTER, Math.min(left, vw - w - VIEWPORT_GUTTER));
  return { left, top };
}

/**
 * A single menu row. Hoisted to module scope so it is one stable component
 * identity across renders rather than a closure recreated on every Menu render.
 * Output and the legacy `.ctx-*` class aliases are identical to the inline
 * version it replaced.
 */
function MenuItemRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  return (
    <div
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
  );
}

export function Menu({ open, x, y, items, onClose, class: cls }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the latest onClose in a ref so the outside-click/Escape effect can read
  // it without listing onClose in its dependency array. Parents commonly pass a
  // fresh inline onClose each render; depending on it would re-attach the
  // document listeners on every parent render. Updating the ref each render and
  // reading ref.current inside the effect keeps a single stable subscription.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Reset to the requested coordinate whenever the menu (re)opens.
  useEffect(() => {
    if (open) setPos({ left: x, top: y });
  }, [open, x, y]);

  // After paint, nudge the menu back inside the viewport if it overflows the
  // right/bottom edges. We always recompute from the requested {x,y} (not the
  // already-corrected value) and only set state when the corrected coordinate
  // differs, so there is no setState feedback loop.
  //
  // Narrow sidebar: a menu wider than the panel (the Dropdown popup widened to
  // the trigger, or a long branch path) would otherwise spill off the right edge
  // when opened near it. We first flip it left of the anchor if it overflows
  // right, then HARD-CLAMP the left edge into [GUTTER, innerWidth - width -
  // GUTTER] so the whole menu stays on-screen even if neither the anchor nor the
  // flipped position fits. The CSS caps menu width at calc(100vw - 16px) so the
  // clamp range is never negative.
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const { left, top } = clampMenuPosition(
      x,
      y,
      r.width,
      r.height,
      window.innerWidth,
      window.innerHeight,
    );
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
  }, [open, x, y]);

  // Close on outside click or Escape while open. Reads onClose via the ref so
  // the listeners attach once per open (not on every parent render).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCloseRef.current();
    };
    // Defer the outside-click listener a tick so the same click that opened the
    // menu does not immediately close it. The mousedown listener only ever calls
    // onClose (never preventDefault), so it is passive.
    const id = setTimeout(
      () => document.addEventListener("mousedown", onDown, { passive: true }),
      0,
    );
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
          <MenuItemRow key={item.label} item={item} onClose={onClose} />
        </>
      ))}
    </div>
  );
}
