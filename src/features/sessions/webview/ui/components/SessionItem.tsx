/**
 * One row in the session list. Shows the live-status dot, name, relative
 * time, optional prompt subtitle, branch tag, project, and pin marker, plus
 * a hover-revealed resume button.
 *
 * Pure presentational component: all interaction is delegated to callbacks so
 * the list view owns selection / navigation logic and this stays testable in
 * isolation.
 */
import { Button, Icon } from "../../../../../webview/shared/ui";
import { fmtRelativeTime } from "../../../../../webview/utils";
import { cx } from "../../../../../webview/shared/lib";
import { now } from "../../../../../webview/shared/model";
import { pathTail } from "../../lib";
import type { Session, WorktreeRef } from "../../../types";

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
  /** True when this row is backed by a temp (ephemeral) run — its transcript
   * is deleted when the terminal closes unless promoted to permanent. */
  isTemp: boolean;
  /**
   * True when this session belongs to a different project than the current
   * workspace. Resuming isn't possible from the row in that case — the detail
   * view offers "Open {project}" instead — so the row hides the Resume
   * affordance rather than offering an action that can't do what it says.
   */
  isDiffProject: boolean;
  /**
   * Resolved git worktree for this session, when it ran inside one. Drives the
   * worktree badge (Claude- vs user-created) — undefined for sessions not in a
   * worktree, and "main"-kind refs render no badge (the primary checkout is the
   * unremarkable default).
   */
  worktree?: WorktreeRef;
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
  isTemp,
  isDiffProject,
  worktree,
  onSelect,
  onResume,
  onView,
  onToggleSelect,
  onContextMenu,
}: SessionItemProps) {
  const displayName = session.name || session.prompts[0] || "Untitled session";
  const branch = session.branch && session.branch !== "HEAD" ? session.branch : "";
  // Badge only for Claude/user worktrees — the main checkout is the default and
  // gets no badge. The badge carries the branch, so the plain branch tag below
  // is suppressed when a badge shows to avoid printing the branch twice.
  const wt = worktree && (worktree.kind === "claude" || worktree.kind === "user") ? worktree : null;
  const wtName = wt ? pathTail(wt.path) : "";
  const wtBranch = wt && wt.branch && wt.branch !== "HEAD" ? wt.branch : "";
  const wtKindLabel = wt?.kind === "claude" ? "Claude-created" : "User-created";
  const wtTitle = wt
    ? `${wtKindLabel} worktree · ${wtName}${wtBranch ? ` · ${wtBranch}` : ""}` +
      (!wt.exists ? " · removed from disk" : wt.locked ? " · in active use" : "")
    : "";
  // Read the shared clock so "5m" → "6m" ticks live without a data change.
  const relTime = fmtRelativeTime(session.endTime, now.value);
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
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        // A row hosts an inline action <Button> (resume/view); its own Enter/
        // Space activation is native — don't also trigger row selection.
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        e.preventDefault();
        onClick(e as unknown as MouseEvent);
      }}
      onContextMenu={onRowContextMenu}
    >
      <div class="item-row1">
        {session.isLive ? (
          <span
            class="live-dot"
            data-status={liveStatus || undefined}
            title={liveTitleForStatus(session.status)}
            role="img"
            aria-label={liveTitleForStatus(session.status)}
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
          {/* A running/idle session already has a process — offer "view"
              (reveal its terminal), never "resume" (which would spawn a
              second, conflicting `claude --resume`). hasOpenTerminal is the
              tracked case; session.isLive covers a session running in a
              terminal the extension never registered (host informs on click
              when it can't be focused). */}
          {hasOpenTerminal || session.isLive ? (
            <Button
              variant="icon"
              class="item-resume"
              iconName="terminal"
              title={hasOpenTerminal ? "View open terminal" : "Session is running — reveal its terminal"}
              onClick={(e) => {
                e.stopPropagation();
                onView(session.id);
              }}
            />
          ) : isDiffProject ? null : (
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
        {isTemp ? (
          <span
            class="tag tag-temp"
            title="Temp session — its transcript is deleted when the terminal closes. Right-click → Make permanent to keep it."
          >
            Temp
          </span>
        ) : null}
        {wt ? (
          <span
            class={cx("tag tag-wt", {
              "tag-wt--claude": wt.kind === "claude",
              "tag-wt--user": wt.kind === "user",
              "tag-wt--missing": !wt.exists,
              "tag-wt--locked": wt.exists && wt.locked,
            })}
            title={wtTitle}
          >
            <Icon name={wt.kind === "claude" ? "bot" : "git-branch"} size={12} />
            <span class="tag-wt__name">{wtName}</span>
            {wtBranch ? <span class="tag-wt__branch">{wtBranch}</span> : null}
          </span>
        ) : branch ? (
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
