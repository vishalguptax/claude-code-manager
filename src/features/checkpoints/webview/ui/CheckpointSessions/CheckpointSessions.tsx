/**
 * The checkpoints tab's first level: every session that has recorded file
 * backups, newest first. Selecting a row opens that session's file history.
 *
 * Built from the directory listing alone host-side, so this renders without
 * any transcript being read — the counts are the honest shape of what is on
 * disk, including sessions whose transcript is long gone.
 *
 * Structurally a sibling of the Skills and Commands list views: a `.panel`
 * root (which is what `.tab-content .panel` gives its scroll to), the shared
 * `.search-row`, and `.item` rows in a `.list`. Nothing here restates chrome
 * the shared layer already owns.
 */
import { cx, formatBytes, formatRelativeTime } from "../../../../../webview/shared/lib";
import {
  Button,
  EmptyState,
  ErrorBanner,
  SearchInput,
} from "../../../../../webview/shared/ui";
import type { CheckpointSessionSummary } from "../../../types";
import {
  errorMessage,
  filteredSessions,
  loadingSessions,
  selectedSessionId,
  sessionQuery,
  sessions,
} from "../../model";

export interface CheckpointSessionsProps {
  onSelect: (sessionId: string) => void;
  onRefresh: () => void;
}

export function CheckpointSessions({ onSelect, onRefresh }: CheckpointSessionsProps) {
  const all = sessions.value;
  const shown = filteredSessions.value;
  const query = sessionQuery.value;
  const err = errorMessage.value;
  const loading = loadingSessions.value;

  return (
    <div class="panel" id="checkpointSessionsView">
      <div class="search-row">
        <SearchInput
          value={query}
          onInput={(value) => {
            sessionQuery.value = value;
          }}
          placeholder="Search"
          ariaLabel="Search checkpoint sessions"
          debounceMs={150}
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="refresh-cw"
          title="Refresh checkpoint sessions"
          ariaLabel="Refresh checkpoint sessions"
          onClick={onRefresh}
        />
      </div>

      {err ? <ErrorBanner errors={[err]} /> : null}

      <div class="list">
        <SessionList
          all={all}
          shown={shown}
          loading={loading}
          searching={query.trim().length > 0}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

interface SessionListProps {
  all: CheckpointSessionSummary[];
  shown: CheckpointSessionSummary[];
  loading: boolean;
  searching: boolean;
  onSelect: (sessionId: string) => void;
}

/** The list body: the count caption and rows, or the state that replaces them. */
function SessionList({ all, shown, loading, searching, onSelect }: SessionListProps) {
  // Before the host's first reply the list is empty but nothing is known yet;
  // claiming "no checkpoints" then would be a guess. The tab shows its
  // skeleton over this state.
  if (loading && all.length === 0) return null;

  if (all.length === 0) {
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

  if (shown.length === 0) {
    return (
      <EmptyState
        icon="search-slash"
        title="No matching sessions"
        description={
          searching
            ? "Try a different keyword, or clear the search to see every session."
            : undefined
        }
      />
    );
  }

  const selectedId = selectedSessionId.value;

  return (
    <>
      <div class="list-count">
        {all.length} {all.length === 1 ? "session" : "sessions"} with checkpoints
      </div>
      {shown.map((session) => (
        <SessionRow
          key={session.sessionId}
          session={session}
          active={selectedId === session.sessionId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

interface SessionRowProps {
  session: CheckpointSessionSummary;
  active: boolean;
  onSelect: (sessionId: string) => void;
}

/** One session row, in the shared two-line `.item` shape. */
function SessionRow({ session, active, onSelect }: SessionRowProps) {
  return (
    <div
      class={cx("item", "ckpt-session", active && "active")}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session.sessionId)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onSelect(session.sessionId);
      }}
    >
      <div class="item-row1">
        {/* The label is a human name; the id is what correlates the row with a
            directory under ~/.claude/file-history, so it rides on the title. */}
        <span class="item-name" title={session.sessionId}>
          {session.label}
        </span>
        {session.lastBackupMs > 0 ? (
          <span class="item-time">{formatRelativeTime(session.lastBackupMs)}</span>
        ) : null}
      </div>
      <div class="item-prompt">
        {session.project ? (
          <>
            <span class="ckpt-project">{session.project}</span>
            {" · "}
          </>
        ) : null}
        <span>
          {session.fileCount} {session.fileCount === 1 ? "file" : "files"}
        </span>
        {" · "}
        <span>
          {session.versionCount} {session.versionCount === 1 ? "version" : "versions"}
        </span>
        {" · "}
        <span>{formatBytes(session.sizeBytes)}</span>
      </div>
    </div>
  );
}
