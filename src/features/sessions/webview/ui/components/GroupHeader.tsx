/**
 * A collapsible section header in the session list: chevron, label, row count.
 *
 * Rendered as a real <button> rather than a styled div so the section is
 * reachable by Tab and toggles on Space/Enter for free, and so screen readers
 * announce the expanded state. `aria-controls` is deliberately absent — the
 * rows it governs are virtualized, so the ids it would reference are not in the
 * DOM when the section is collapsed.
 */
import { Icon } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";

export interface GroupHeaderProps {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: (label: string) => void;
}

export function GroupHeader({ label, count, collapsed, onToggle }: GroupHeaderProps) {
  return (
    <button
      type="button"
      class={cx("session-group-header", { collapsed })}
      aria-expanded={!collapsed}
      title={`${collapsed ? "Expand" : "Collapse"} ${label} (${count})`}
      onClick={() => onToggle(label)}
    >
      <span class="session-group-chevron" aria-hidden="true">
        <Icon name="chevron-down" size={12} />
      </span>
      <span class="session-group-label">{label}</span>
      <span class="session-group-count">{count}</span>
    </button>
  );
}
