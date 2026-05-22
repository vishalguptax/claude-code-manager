/**
 * Right-click context menu. Thin alias over <Menu> so the right-click menu and
 * any overflow ("…") menu are pixel-identical and use the same native
 * VS Code menu chrome (see ../Menu/Menu.tsx for positioning, dismissal, and
 * styling). ContextMenu exists as a distinct name because its call sites read
 * better ("a context menu at this point") and its item shape is a deliberate
 * subset — no keybinding hints, no disabled rows — matching what a right-click
 * menu offers.
 *
 * Why not `<vscode-context-menu>`: that element's items carry only label /
 * keybinding / value / separator — no per-item icon and no danger styling, and
 * it does not anchor to an arbitrary click point. The session menu needs all
 * three (icons, a red Delete row, open-at-cursor), which <Menu> provides.
 */
import { Menu, type MenuItem } from "../Menu";

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
  // ContextMenuItem is a structural subset of MenuItem, so it passes through
  // directly — the cast just narrows the readonly intent for the shared menu.
  return <Menu open={open} x={x} y={y} items={items as MenuItem[]} onClose={onClose} />;
}
