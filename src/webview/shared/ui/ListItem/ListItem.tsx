/**
 * Generic clickable row used by feature list views.
 */
import type { ComponentChildren } from "preact";
import { cx } from "../../lib";

export interface ListItemProps {
  active?: boolean;
  onClick?: (e: MouseEvent) => void;
  /** Right-click handler. Callers preventDefault to replace the host menu. */
  onContextMenu?: (e: MouseEvent) => void;
  children?: ComponentChildren;
  class?: string;
}

export function ListItem({
  active,
  onClick,
  onContextMenu,
  children,
  class: cls,
}: ListItemProps) {
  return (
    <div
      class={cx("list-item", active && "active", cls)}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        // A row hosts inline action <Button>s; Space on a focused BUTTON
        // descendant is that button's own activation, not the row's — let it
        // through instead of double-firing (row select + button action).
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        e.preventDefault();
        onClick?.(e as unknown as MouseEvent);
      }}
    >
      {children}
    </div>
  );
}
