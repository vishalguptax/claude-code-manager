/**
 * One row in the session list. Shows the live-status dot, name, relative
 * time, optional prompt subtitle, branch tag, project, and pin marker, plus
 * a hover-revealed resume button.
 *
 * Pure presentational component: all interaction is delegated to callbacks so
 * the list view owns selection / navigation logic and this stays testable in
 * isolation.
 */
import { Icon } from "../../../../webview/components/Icon";
import { fmtRelativeTime } from "../../../../webview/utils";
import { cx } from "../../../../webview/utils/classnames";
import type { Session } from "../../types";

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
  onSelect: (id: string) => void;
  onResume: (id: string) => void;
  onToggleSelect: (id: string, range: boolean) => void;
}

export function SessionItem({
  session,
  isActive,
  isPinned,
  isSelected,
  bulkMode,
  onSelect,
  onResume,
  onToggleSelect,
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

  return (
    <div
      class={cx("item session-item", { active: isActive, "is-selected": isSelected })}
      data-id={session.id}
      onClick={onClick}
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
        <button
          type="button"
          class="item-resume"
          title="Resume session"
          onClick={(e) => {
            e.stopPropagation();
            onResume(session.id);
          }}
        >
          <Icon name="play" />
        </button>
      )}

      {showSubPrompt ? (
        <div class="item-prompt" title={firstPrompt}>
          {firstPrompt}
        </div>
      ) : null}

      <div class="item-row2">
        {branch ? (
          <span class="tag" title={branch}>
            {branch}
          </span>
        ) : null}
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
