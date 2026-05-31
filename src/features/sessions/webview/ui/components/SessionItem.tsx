/**
 * One row in the session list. Shows the live-status dot, name, relative
 * time, optional prompt subtitle, branch tag, project, and pin marker, plus
 * a hover-revealed resume button.
 *
 * Pure presentational component: all interaction is delegated to callbacks so
 * the list view owns selection / navigation logic and this stays testable in
 * isolation.
 */
import { Badge, Button, Icon } from "../../../../../webview/shared/ui";
import { fmtRelativeTime } from "../../../../../webview/utils";
import { cx } from "../../../../../webview/shared/lib";
import type { Session } from "../../../types";

/**
 * Map a CLI-reported lifecycle status to a tooltip. Known values get a
 * friendly label; unknown strings fall through to the raw status so new CLI
 * states surface without an extension update.
 */
export function liveTitleForStatus(status: string | undefined): string {
  switch (status) {
    case "busy":
      return "Session is busy";
    case "idle":
      return "Session is idle";
    case "awaiting_permission":
    case "waiting_permission":
    case "permission_prompt":
      return "Awaiting permission";
    case "awaiting_question":
      return "Awaiting your answer";
    case undefined:
    case "":
      return "Session is live";
    default:
      return `Session: ${status}`;
  }
}

export interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isPinned: boolean;
  isSelected: boolean;
  bulkMode: boolean;
  hasOpenTerminal: boolean;
  onSelect: (id: string) => void;
  onResume: (id: string) => void;
  onView: (id: string) => void;
  onToggleSelect: (id: string, range: boolean) => void;
  /** Open the row's action menu at the given viewport point (right-click). */
  onContextMenu: (id: string, x: number, y: number) => void;
}

export function SessionItem({
  session,
  isActive,
  isPinned,
  isSelected,
  bulkMode,
  hasOpenTerminal,
  onSelect,
  onResume,
  onView,
  onToggleSelect,
  onContextMenu,
}: SessionItemProps) {
  const displayName = session.name || session.prompts[0] || "Untitled session";
  const branch = session.branch && session.branch !== "HEAD" ? session.branch : "";
  const relTime = fmtRelativeTime(session.endTime);
  const absDate = new Date(session.endTime).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const firstPrompt = session.prompts[0] ?? "";
  const showSubPrompt = Boolean(session.name && firstPrompt);
  const liveStatus = session.isLive ? session.status ?? "" : "";

  const onClick = (e: MouseEvent): void => {
    if (bulkMode) {
      onToggleSelect(session.id, e.shiftKey === true);
      return;
    }
    onSelect(session.id);
  };

  // Right-click opens the row's action menu at the cursor. Suppressed in bulk
  // mode (clicks toggle selection there) to match v1.
  const onRowContextMenu = (e: MouseEvent): void => {
    if (bulkMode) return;
    e.preventDefault();
    onContextMenu(session.id, e.clientX, e.clientY);
  };

  return (
    <div
      class={cx("item session-item", { active: isActive, "is-selected": isSelected })}
      data-id={session.id}
      onClick={onClick}
      onContextMenu={onRowContextMenu}
    >
      <div class="item-row1">
        {session.isLive ? (
          <span
            class="live-dot"
            data-status={liveStatus || undefined}
            title={liveTitleForStatus(session.status)}
            aria-hidden="true"
          />
        ) : null}
        <span class="item-name" title={displayName}>
          {displayName}
        </span>
        <span class="item-time" title={absDate}>
          {relTime}
        </span>
      </div>

      {bulkMode ? null : (
        <div class="item-actions">
          {hasOpenTerminal ? (
            <Button
              variant="icon"
              class="item-resume"
              iconName="terminal"
              title="View open terminal"
              onClick={(e) => {
                e.stopPropagation();
                onView(session.id);
              }}
            />
          ) : (
            <Button
              variant="icon"
              class="item-resume"
              iconName="play"
              title="Resume session"
              onClick={(e) => {
                e.stopPropagation();
                onResume(session.id);
              }}
            />
          )}
        </div>
      )}

      {showSubPrompt ? (
        <div class="item-prompt" title={firstPrompt}>
          {firstPrompt}
        </div>
      ) : null}

      <div class="item-row2">
        {branch ? <Badge text={branch} title={branch} class="tag" /> : null}
        <span class="item-proj" title={session.project}>
          {session.project}
        </span>
        {isPinned ? (
          <span class="pin-icon" title="Pinned">
            <Icon name="pin" size={14} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
