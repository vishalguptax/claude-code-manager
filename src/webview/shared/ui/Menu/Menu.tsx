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
 *   - closes on outside press, Escape, or after a (non-disabled) item is chosen,
 *   - one menu open at a time — the owner controls `open`.
 *
 * Anchor-aware dismissal: callers that open the menu from a toggle (a Dropdown
 * trigger) pass `anchorRef`. The outside-press handler then excludes BOTH the
 * menu and the anchor, so the trigger's own onClick is the only thing that
 * toggles open state — re-clicking an open trigger closes it cleanly instead of
 * the document listener closing it on pointerdown and the click reopening it.
 */
import type { RefObject } from "preact";
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
  /**
   * The element that toggles this menu (e.g. a Dropdown trigger). When given,
   * the outside-press handler IGNORES presses on it, so the anchor's own click
   * handler is the single source of toggle truth and the document listener
   * never fights it (no close-then-reopen flicker on re-click). Right-click
   * context menus open at a bare coordinate with no anchor and omit this.
   */
  anchorRef?: RefObject<HTMLElement | null>;
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

export function Menu({ open, x, y, items, onClose, class: cls, anchorRef }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the latest onClose in a ref so the outside-click/Escape effect can read
  // it without listing onClose in its dependency array. Parents commonly pass a
  // fresh inline onClose each render; depending on it would re-attach the
  // document listeners on every parent render. Updating the ref each render and
  // reading ref.current inside the effect keeps a single stable subscription.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Same treatment for the anchor ref: read it through a stable holder so the
  // outside-press effect can exclude the trigger without listing it (a fresh
  // RefObject each parent render) in the dependency array.
  const anchorHolder = useRef(anchorRef);
  anchorHolder.current = anchorRef;

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

  // Close on outside press or Escape while open. Reads onClose/anchor via refs
  // so the listeners attach once per open (not on every parent render).
  //
  // Anchor-aware dismissal: an outside press closes the menu UNLESS it lands on
  // the menu itself OR on the anchor (the trigger that toggles it). Excluding
  // the anchor is what makes the trigger's own onClick the single source of
  // toggle truth: re-clicking an open trigger must not have this handler fire
  // onClose on `pointerdown` only for the trigger's `click` to immediately
  // reopen it (the close-then-reopen flicker). With the anchor excluded, the
  // pointerdown is ignored and the trigger's click cleanly toggles to closed.
  //
  // pointerdown (capture) fires before the trigger's click for both mouse and
  // touch, so dismissal is decided before any toggle runs.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event): void => {
      const target = e.target as Node | null;
      if (ref.current && target && ref.current.contains(target)) return;
      const anchor = anchorHolder.current?.current ?? null;
      if (anchor && target && anchor.contains(target)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCloseRef.current();
    };
    // Defer attaching the outside-press listener a tick so the same press that
    // opened the menu does not immediately close it. The listener only ever
    // calls onClose (never preventDefault), so it is passive.
    const id = setTimeout(
      () => document.addEventListener("pointerdown", onDown, { capture: true, passive: true }),
      0,
    );
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerdown", onDown, { capture: true });
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
