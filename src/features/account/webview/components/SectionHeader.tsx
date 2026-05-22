/**
 * Collapsible section header. Renders a chevron + title that toggles
 * the section open/closed on click or Enter/Space. Optional `children`
 * (used by Quota for its freshness stamp + refresh button) sit at the
 * right edge of the header.
 */

import type { ComponentChildren } from "preact";
import { cx } from "../../../../webview/utils/classnames";
import { Icon } from "../../../../webview/components/Icon";

export interface SectionHeaderProps {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  children?: ComponentChildren;
}

export function SectionHeader({ id, title, collapsed, onToggle, children }: SectionHeaderProps) {
  const toggle = (): void => onToggle(id);
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  return (
    <header
      class="acct-section-header"
      data-section={id}
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      <span class={cx("acct-section-chevron", collapsed && "collapsed")}>
        <Icon name="chevron-down" size={14} />
      </span>
      <h2 class="acct-section-title">{title}</h2>
      {children}
    </header>
  );
}
