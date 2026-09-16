/**
 * The checkpoints tab's first level: every session that has recorded file
 * backups, newest first. Selecting a row opens that session's file history.
 *
 * Built from the directory listing alone host-side, so this renders without
 * any transcript being read — the counts are the honest shape of what is on
 * disk, including sessions whose transcript is long gone.
 */
import { formatBytes, formatRelativeTime } from "../../../../../webview/shared/lib";
import { EmptyState, ErrorBanner, Button, ListItem } from "../../../../../webview/shared/ui";
import {
  errorMessage,
  loadingSessions,
  sessions,
} from "../../model";

export interface CheckpointSessionsProps {
  onSelect: (sessionId: string) => void;
  onRefresh: () => void;
}

export function CheckpointSessions({ onSelect, onRefresh }: CheckpointSessionsProps) {
  const rows = sessions.value;
  const err = errorMessage.value;
  const loading = loadingSessions.value;

  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="No file checkpoints yet"
        description={
          <>
            Claude Code writes a backup of every file it edits into{" "}
            <code>~/.claude/file-history</code>. Once a session edits a file, its
            versions show up here.
          </>
        }
      />
    );
  }

  return (
    <div class="ckpt-view">
      {err ? <ErrorBanner errors={[err]} /> : null}
      <div class="ckpt-toolbar">
        <span class="list-count">
          {rows.length} {rows.length === 1 ? "session" : "sessions"} with checkpoints
        </span>
        <Button
          variant="icon"
          iconName="refresh-cw"
          title="Refresh"
          ariaLabel="Refresh checkpoint sessions"
          onClick={onRefresh}
        />
      </div>
      <div class="ckpt-list">
        {rows.map((session) => (
          <ListItem
            key={session.sessionId}
            class="ckpt-session"
            onClick={() => onSelect(session.sessionId)}
          >
            <div class="ckpt-row-main">
              <span class="ckpt-session-label" title={session.sessionId}>
                {session.label}
              </span>
              {session.lastBackupMs > 0 ? (
                <span class="ckpt-time">{formatRelativeTime(session.lastBackupMs)}</span>
              ) : null}
            </div>
            <div class="ckpt-row-meta">
              {session.project ? <span class="ckpt-project">{session.project}</span> : null}
              <span>
                {session.fileCount} {session.fileCount === 1 ? "file" : "files"}
              </span>
              <span>
                {session.versionCount}{" "}
                {session.versionCount === 1 ? "version" : "versions"}
              </span>
              <span>{formatBytes(session.sizeBytes)}</span>
            </div>
          </ListItem>
        ))}
      </div>
    </div>
  );
}
