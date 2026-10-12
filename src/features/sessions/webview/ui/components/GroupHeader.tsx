/**
 * A collapsible section header in the session list: chevron, label, row count.
 * A folder's header also carries a folder icon and opens the folder's actions
 * on right-click (or Shift+F10 / the Menu key, which fire the same event on
 * the focused button).
 *
 * Rendered as a real <button> rather than a styled div so the section is
 * reachable by Tab and toggles on Space/Enter for free, and so screen readers
 * announce the expanded state. `aria-controls` is deliberately absent — the
 * rows it governs are virtualized, so the ids it would reference are not in the
 * DOM when the section is collapsed.
 */
import { useRef } from "preact/hooks";
import { Icon } from "../../../../../webview/shared/ui";
import { cx, keepAnchored } from "../../../../../webview/shared/lib";

export interface GroupHeaderProps {
  /** Section key — what `onToggle` receives. See the sessions `Row` type. */
  sectionKey: string;
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: (key: string) => void;
  /** Present only on a folder's header: open its actions at a viewport point. */
  onFolderMenu?: (x: number, y: number) => void;
}

export function GroupHeader({
  sectionKey,
  label,
  count,
  collapsed,
  onToggle,
  onFolderMenu,
}: GroupHeaderProps) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      class={cx("session-group-header", { collapsed })}
      aria-expanded={!collapsed}
      title={`${collapsed ? "Expand" : "Collapse"} ${label} (${count})${
        onFolderMenu ? " · right-click to rename or remove the folder" : ""
      }`}
      // Collapsing a long day-group shortens the list under the pointer; hold
      // this header still rather than let the browser clamp the scroll.
      onClick={() => keepAnchored(ref.current, () => onToggle(sectionKey))}
      onContextMenu={
        onFolderMenu
          ? (e: MouseEvent) => {
              e.preventDefault();
              onFolderMenu(e.clientX, e.clientY);
            }
          : undefined
      }
    >
      <span class="session-group-chevron" aria-hidden="true">
        <Icon name="chevron-down" size={12} />
      </span>
      {onFolderMenu ? (
        <span class="session-group-icon" aria-hidden="true">
          <Icon name="folder" size={12} />
        </span>
      ) : null}
      <span class="session-group-label">{label}</span>
      <span class="session-group-count">{count}</span>
    </button>
  );
}
