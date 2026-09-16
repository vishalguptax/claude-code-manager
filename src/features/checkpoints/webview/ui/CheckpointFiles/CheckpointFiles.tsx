/**
 * The checkpoints tab's second level: every file the selected session touched,
 * each expanding to its recorded versions.
 *
 * Navigation matches every other detail view in the extension — the shared
 * <BackButton> at the top of a `.panel`, then the `.d-head` / `.d-title`
 * heading — so returning from a file list is the same gesture as returning
 * from a skill or a command. The rows below it are the same `.item` shape as
 * the session list, and the `.list` underneath owns the single scroll.
 *
 * Versions are listed newest first. A version whose blob Claude Code has since
 * pruned stays visible but is marked unavailable and its actions are disabled
 * — hiding it would make the version numbers jump with no explanation.
 *
 * Restore is destructive, so the button carries a danger variant and the host
 * confirms with a modal before it writes anything. Nothing in this component
 * touches the user's files.
 */
import { Fragment } from "preact";
import { cx, formatBytes, formatRelativeTime } from "../../../../../webview/shared/lib";
import {
  BackButton,
  Button,
  EmptyState,
  ErrorBanner,
  SearchInput,
  SkeletonList,
  Tag,
} from "../../../../../webview/shared/ui";
import type { CheckpointFile } from "../../../types";
import { backupTimeMs, describeFileHistory, newestFirst } from "../../lib";
import {
  errorMessage,
  expandedPath,
  fileQuery,
  filteredFiles,
  files,
  loadingFiles,
  orphanCount,
  selectedSession,
} from "../../model";

export interface CheckpointFilesProps {
  onBack: () => void;
  /** Open the working file in an editor. */
  onOpenFile: (path: string) => void;
  /** Diff one recorded version against the working file. */
  onDiff: (filePath: string, version: number) => void;
  /** Ask the host to restore one version. The host confirms before writing. */
  onRestore: (filePath: string, version: number) => void;
}

export function CheckpointFiles({
  onBack,
  onOpenFile,
  onDiff,
  onRestore,
}: CheckpointFilesProps) {
  const session = selectedSession.value;
  const all = files.value;
  const shown = filteredFiles.value;
  const query = fileQuery.value;
  const orphans = orphanCount.value;
  const err = errorMessage.value;
  const loading = loadingFiles.value;

  return (
    <div class="panel" id="checkpointFilesView">
      {/* Back first, then the heading: the same order as the skills and
          commands detail views, so the affordance never moves between tabs. */}
      <BackButton onClick={onBack} label="All sessions" />

      {session ? (
        <div class="d-head">
          <div class="d-title" title={session.sessionId}>
            {session.label}
          </div>
          {session.project ? <div class="d-subtitle">{session.project}</div> : null}
        </div>
      ) : null}

      {err ? <ErrorBanner errors={[err]} /> : null}

      <div class="search-row">
        <SearchInput
          value={query}
          onInput={(value) => {
            fileQuery.value = value;
          }}
          placeholder="Search"
          ariaLabel="Search files"
          debounceMs={150}
        />
      </div>

      <div class="list">
        {loading ? (
          <SkeletonList rows={8} />
        ) : (
          <FileList
            all={all}
            shown={shown}
            orphans={orphans}
            searching={query.trim().length > 0}
            onOpenFile={onOpenFile}
            onDiff={onDiff}
            onRestore={onRestore}
          />
        )}
      </div>
    </div>
  );
}

interface FileListProps {
  all: CheckpointFile[];
  shown: CheckpointFile[];
  orphans: number;
  searching: boolean;
  onOpenFile: (path: string) => void;
  onDiff: (filePath: string, version: number) => void;
  onRestore: (filePath: string, version: number) => void;
}

/** The list body: the count caption and rows, or the state that replaces them. */
function FileList({
  all,
  shown,
  orphans,
  searching,
  onOpenFile,
  onDiff,
  onRestore,
}: FileListProps) {
  if (all.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="No tracked files for this session"
        description={
          orphans > 0
            ? `${orphans} ${orphans === 1 ? "backup is" : "backups are"} on disk, but this session's transcript no longer records which files they belong to.`
            : "This session's transcript records no file edits."
        }
      />
    );
  }

  if (shown.length === 0) {
    return (
      <EmptyState
        icon="search-slash"
        title="No matching files"
        description={
          searching
            ? "Try a different keyword, or clear the search to see every file."
            : undefined
        }
      />
    );
  }

  const expanded = expandedPath.value;

  return (
    <>
      <div class="list-count">
        <span>
          {shown.length} of {all.length} {all.length === 1 ? "file" : "files"}
        </span>
        {orphans > 0 ? (
          <>
            {" · "}
            <span
              class="ckpt-orphans"
              title="Backups on disk that this session's transcript no longer links to a file."
            >
              {orphans} unmatched {orphans === 1 ? "backup" : "backups"}
            </span>
          </>
        ) : null}
      </div>

      {shown.map((file) => (
        <Fragment key={file.path}>
          <FileRow file={file} open={expanded === file.path} />
          {expanded === file.path ? (
            <VersionList
              file={file}
              onOpenFile={onOpenFile}
              onDiff={onDiff}
              onRestore={onRestore}
            />
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

/** One file row, in the shared two-line `.item` shape. */
function FileRow({ file, open }: { file: CheckpointFile; open: boolean }) {
  const toggle = (): void => {
    expandedPath.value = open ? null : file.path;
  };
  return (
    <div
      class={cx("item", "ckpt-file", open && "active")}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggle();
      }}
    >
      <div class="item-row1">
        <span class="item-name" title={file.path}>
          {file.name}
        </span>
        <Tag text={`v${file.latestVersion}`} />
      </div>
      <div class="item-prompt">
        <span class="ckpt-dir" title={file.dir}>
          {file.dir}
        </span>
        {" · "}
        <span>{describeFileHistory(file)}</span>
      </div>
    </div>
  );
}

interface VersionListProps {
  file: CheckpointFile;
  onOpenFile: (path: string) => void;
  onDiff: (filePath: string, version: number) => void;
  onRestore: (filePath: string, version: number) => void;
}

/** The recorded versions of one file, newest first, under its row. */
function VersionList({ file, onOpenFile, onDiff, onRestore }: VersionListProps) {
  return (
    <div class="ckpt-versions">
      <Button
        variant="ghost"
        iconName="external-link"
        label="Open current file"
        class="ckpt-open-btn"
        onClick={() => onOpenFile(file.path)}
      />
      {newestFirst(file.versions).map((version) => {
        const ms = backupTimeMs(version);
        return (
          <div
            key={version.backupFileName}
            class={cx("ckpt-version", !version.available && "ckpt-version--gone")}
          >
            <span class="ckpt-version-num">v{version.version}</span>
            <span class="ckpt-version-meta">
              {ms > 0 ? formatRelativeTime(ms) : "unknown time"}
              {version.available ? ` · ${formatBytes(version.sizeBytes)}` : ""}
            </span>
            {version.available ? (
              <span class="ckpt-version-actions">
                <Button
                  variant="ghost"
                  label="Diff"
                  title={`Compare v${version.version} with the current ${file.name}`}
                  onClick={() => onDiff(file.path, version.version)}
                />
                <Button
                  variant="danger"
                  label="Restore"
                  title={`Overwrite ${file.name} with v${version.version}`}
                  onClick={() => onRestore(file.path, version.version)}
                />
              </span>
            ) : (
              <span class="ckpt-version-gone-note">pruned</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
