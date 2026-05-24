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
 *   - closes on outside press / Escape / webview blur (via the shared
 *     `useDismiss` hook), or after a (non-disabled) item is chosen,
 *   - one menu open at a time — the owner controls `open`.
 *
 * Anchor-aware dismissal: callers that open the menu from a toggle (a Dropdown
 * trigger) pass `anchorRef`, forwarded to useDismiss as an `ignore` element so
 * an outside press on the trigger is excluded — the trigger's own onClick is the
 * only thing that toggles open state, so re-clicking an open trigger closes it
 * cleanly instead of the document listener closing on pointerdown and the click
 * reopening it.
 */
import type { RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { useDismiss } from "../../hooks";
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
 *
 * Width cap: the clamp alone is not enough on a narrow sidebar. The CSS only
 * caps the box at `calc(100vw - 16px)` — a viewport-relative width that ignores
 * `left`, so when the menu is pinned at left > GUTTER the right edge can still
 * land at `left + (vw - 16)` and spill off-screen, cutting labels ("Ren…",
 * "Del…"). So we also return `maxWidth` = the space actually available from the
 * clamped `left` to the right gutter (`vw - left - GUTTER`). Applied inline it
 * guarantees the box can NEVER exceed the viewport regardless of content; the
 * row labels then ellipsize inside that hard cap.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
): { left: number; top: number; maxWidth: number } {
  let left = x;
  let top = y;
  if (x + w > vw) left = x - w;
  if (y + h > vh) top = Math.max(0, y - h);
  left = Math.max(VIEWPORT_GUTTER, Math.min(left, vw - w - VIEWPORT_GUTTER));
  // Never wider than the gap from the (clamped) left edge to the right gutter.
  const maxWidth = vw - left - VIEWPORT_GUTTER;
  return { left, top, maxWidth };
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
  // `maxWidth` starts unconstrained (Infinity → no inline cap) and is set once
  // the post-paint measure knows the viewport gap from the clamped left edge.
  const [pos, setPos] = useState<{ left: number; top: number; maxWidth: number }>({
    left: x,
    top: y,
    maxWidth: Number.POSITIVE_INFINITY,
  });

  // Position + viewport clamp in a SINGLE layout effect (before paint). A prior
  // version also had a passive useEffect that reset pos to the raw {x,y} on
  // open — it ran AFTER this clamp and, because the deps never changed again,
  // left the menu pinned at the unclamped click point (it spilled off the right
  // edge). That reset is gone; this effect is the sole source of position.
  //
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
  // flipped position fits, AND cap the box width to the gap from that clamped
  // left edge to the right gutter (`maxWidth`) so the box can never exceed the
  // viewport regardless of content — long labels then ellipsize inside the cap.
  // The CSS `max-width: calc(100vw - 16px)` is a coarse backstop; this inline cap
  // is the precise one (it accounts for `left`).
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    // Measure the menu's NATURAL width: temporarily lift any inline width cap
    // (left over from a previous open) so the clamp sizes against real content,
    // not a stale cap. The browser hasn't painted between this write and read,
    // so there is no visible flash.
    const prevMax = el.style.maxWidth;
    el.style.maxWidth = "none";
    const r = el.getBoundingClientRect();
    el.style.maxWidth = prevMax;
    const { left, top, maxWidth } = clampMenuPosition(
      x,
      y,
      r.width,
      r.height,
      window.innerWidth,
      window.innerHeight,
    );
    setPos((prev) =>
      prev.left === left && prev.top === top && prev.maxWidth === maxWidth
        ? prev
        : { left, top, maxWidth },
    );
  }, [open, x, y]);

  // Close on outside press / Escape / webview blur via the shared hook. The
  // anchor (a Dropdown trigger) is passed as an `ignore` element so an outside
  // press on it is NOT treated as a dismissal — the trigger's own onClick is the
  // single source of toggle truth, so re-clicking an open trigger closes it
  // cleanly instead of the document listener closing on pointerdown only for the
  // click to immediately reopen (the close-then-reopen flicker). Right-click
  // context menus open at a bare coordinate with no anchor and pass none.
  useDismiss({
    open,
    onDismiss: onClose,
    contentRef: ref,
    ignore: anchorRef ? [anchorRef] : undefined,
  });

  if (!open) return null;

  return (
    // Legacy `.ctx-*` class names ride alongside the native `.vsc-menu*` ones so
    // existing right-click call sites/tests (sessions ListView) keep matching
    // during the transition; both resolve to the same native styles.
    <div
      ref={ref}
      class={cls ? `vsc-menu ctx-menu ${cls}` : "vsc-menu ctx-menu"}
      role="menu"
      style={{
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        // Inline width cap from the post-paint measure. Omitted on the first
        // paint (Infinity) so the box renders at its natural/CSS-capped width,
        // then tightened to the on-screen gap once measured.
        maxWidth: Number.isFinite(pos.maxWidth) ? `${pos.maxWidth}px` : undefined,
      }}
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
