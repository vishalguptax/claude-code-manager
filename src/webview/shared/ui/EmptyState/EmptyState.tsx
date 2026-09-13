/**
 * The empty state. One component for every "there is nothing here yet"
 * surface in the extension.
 *
 * There used to be six of these: this component, a bare `.empty` div, a
 * string-building `renderEmptyState()` helper, and private `.cmd-empty`,
 * `.hook-empty`, `.agent-empty`, `.mcp-empty` and `.acct-empty` blocks. They
 * disagreed about type sizes, spacing and whether the copy was centred, so
 * which tab you happened to empty decided how the message looked.
 *
 * Two shapes, because there are genuinely two situations:
 *
 *   default  — the whole panel is empty. Centred, generous vertical space,
 *              room for an icon and a call to action.
 *   compact  — a SECTION inside an otherwise full panel is empty (the Account
 *              tab's Profile and Usage blocks, a permission list). Tighter,
 *              sits in the flow of the section rather than taking the view.
 *
 * `description` takes nodes, not just a string: most of these explain a file
 * format and want <code> in the middle of a sentence.
 */
import type { ComponentChildren } from "preact";
import { cx } from "../../lib";
import { Icon } from "../Icon";

export interface EmptyStateProps {
  title: string;
  description?: ComponentChildren;
  /** Lucide icon name. Omitted in `compact`, where it would crowd the section. */
  icon?: string;
  /** Tighter, in-flow variant for an empty section inside a populated panel. */
  compact?: boolean;
  /**
   * Announce the state to assistive tech as it appears. Use for a state the
   * user is waiting out (indexing, warming a cache), not for a steady one.
   */
  role?: "status";
  children?: ComponentChildren;
}

export function EmptyState({
  title,
  description,
  icon,
  compact = false,
  role,
  children,
}: EmptyStateProps) {
  return (
    <div class={cx("empty-state", compact && "empty-state--compact")} role={role}>
      {icon && !compact ? <Icon name={icon} size={32} /> : null}
      <div class="empty-state-title">{title}</div>
      {description ? <div class="empty-state-desc">{description}</div> : null}
      {children}
    </div>
  );
}
