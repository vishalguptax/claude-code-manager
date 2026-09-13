/**
 * Section — a titled block inside a scrolling panel, optionally collapsible.
 *
 * The Account tab invented this, and when the Config tab needed the same thing
 * it reached across and rendered Account's `.acct-section*` classes directly.
 * That is the shape of a missing primitive: the second caller could not name
 * what it was using, so it borrowed the first caller's name. Config is not an
 * account, and `account.css` is not a shared layer.
 *
 * `<SectionHeader>` is exported separately so a caller that manages its own
 * body (a section whose content is a list, not a block) can use just the head.
 */
import type { ComponentChildren } from "preact";
import { cx } from "../../lib";
import { Icon } from "../Icon";

export interface SectionHeaderProps {
  /** Stable id; also the `data-section` hook and the collapse key. */
  id: string;
  title: string;
  /** Lucide icon shown before the title. Omit for a plain heading. */
  icon?: string;
  /**
   * Collapsed state. Omit entirely for a section that does not collapse — the
   * header then renders as a heading rather than a button, so a screen reader
   * is not told there is something to toggle.
   */
  collapsed?: boolean;
  onToggle?: (id: string) => void;
  /** Trailing content, pinned right (a freshness stamp, a refresh button). */
  children?: ComponentChildren;
}

export function SectionHeader({
  id,
  title,
  icon,
  collapsed,
  onToggle,
  children,
}: SectionHeaderProps) {
  const collapsible = typeof collapsed === "boolean" && Boolean(onToggle);
  const toggle = (): void => onToggle?.(id);
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggle();
  };

  return (
    <header
      class="section-header"
      data-section={id}
      role={collapsible ? "button" : undefined}
      tabIndex={collapsible ? 0 : undefined}
      aria-expanded={collapsible ? !collapsed : undefined}
      onClick={collapsible ? toggle : undefined}
      onKeyDown={collapsible ? onKeyDown : undefined}
    >
      {collapsible ? (
        <span class={cx("section-chevron", collapsed && "collapsed")}>
          <Icon name="chevron-down" size={14} />
        </span>
      ) : icon ? (
        <span class="section-icon">
          <Icon name={icon} size={14} />
        </span>
      ) : null}
      <h2 class="section-title">{title}</h2>
      {children}
    </header>
  );
}

export interface SectionProps extends SectionHeaderProps {
  /** Header-trailing content. Distinct from the body, which is `children`. */
  headerActions?: ComponentChildren;
  children?: ComponentChildren;
}

export function Section({ headerActions, children, ...head }: SectionProps) {
  return (
    <section class="section">
      <SectionHeader {...head}>{headerActions}</SectionHeader>
      {head.collapsed ? null : <div class="section-body">{children}</div>}
    </section>
  );
}
