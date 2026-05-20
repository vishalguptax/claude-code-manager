/**
 * Generic clickable row used by feature list views.
 */
import type { ComponentChildren } from "preact";
import { cx } from "../utils/classnames";

export interface ListItemProps {
  active?: boolean;
  onClick?: (e: MouseEvent) => void;
  children?: ComponentChildren;
  class?: string;
}

export function ListItem({ active, onClick, children, class: cls }: ListItemProps) {
  return (
    <div
      class={cx("list-item", active && "active", cls)}
      role="button"
      tabIndex={0}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
