/**
 * The checkpoints tab's second level: every file the selected session touched,
 * each expanding to its recorded versions.
 *
 * Versions are listed newest first. A version whose blob Claude Code has since
 * pruned stays visible but is marked unavailable and its actions are disabled
 * — hiding it would make the version numbers jump with no explanation.
 *
 * Restore is destructive, so the button carries a danger variant and the host
 * confirms with a modal before it writes anything. Nothing in this component
 * touches the user's files.
 */
import { formatBytes, formatRelativeTime } from "../../../../../webview/shared/lib";
import {
  BackButton,
  Button,
  EmptyState,
  ErrorBanner,
  ListItem,
  ListSkeleton,
  SearchInput,
} from "../../../../../webview/shared/ui";
import { backupTimeMs, describeFileHistory, newestFirst } from "../../lib";
import {
  errorMessage,
  expandedPath,
  filteredFiles,
  files,
  loadingFiles,
  orphanCount,
  searchQuery,
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
  const query = searchQuery.value;
  const expanded = expandedPath.value;
  const orphans = orphanCount.value;
  const err = errorMessage.value;

  if (loadingFiles.value) return <ListSkeleton />;

  return (
    <div class="ckpt-view">
      <div class="ckpt-header">
        <BackButton onClick={onBack} label="All sessions" />
        {session ? (
          <span class="ckpt-header-title" title={session.sessionId}>
            {session.label}
          </span>
        ) : null}
      </div>

      {err ? <ErrorBanner errors={[err]} /> : null}

      {all.length === 0 ? (
        <EmptyState
          icon="history"
          title="No tracked files for this session"
          description={
            orphans > 0
              ? `${orphans} backup ${orphans === 1 ? "blob is" : "blobs are"} on disk, but the session transcript no longer records which files they belong to.`
              : "This session's transcript records no file edits."
          }
        />
      ) : (
        <>
          <SearchInput
            value={query}
            onInput={(value) => {
              searchQuery.value = value;
            }}
            placeholder="Filter files…"
            ariaLabel="Filter checkpoint files"
          />
          <div class="ckpt-toolbar">
            <span class="list-count">
              {shown.length} of {all.length} {all.length === 1 ? "file" : "files"}
            </span>
            {orphans > 0 ? (
              <span
                class="ckpt-orphans"
                title="Backups on disk that the transcript no longer maps to a file path."
              >
                {orphans} unmapped
              </span>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <EmptyState compact title="No files match that filter" />
          ) : (
            <div class="ckpt-list">
              {shown.map((file) => {
                const open = expanded === file.path;
                return (
                  <div key={file.path} class="ckpt-file">
                    <ListItem
                      active={open}
                      class="ckpt-file-row"
                      onClick={() => {
                        expandedPath.value = open ? null : file.path;
                      }}
                    >
                      <div class="ckpt-row-main">
                        <span class="ckpt-file-name" title={file.path}>
                          {file.name}
                        </span>
                        <span class="ckpt-badge">v{file.latestVersion}</span>
                      </div>
                      <div class="ckpt-row-meta">
                        <span class="ckpt-file-dir" title={file.dir}>
                          {file.dir}
                        </span>
                        <span>{describeFileHistory(file)}</span>
                      </div>
                    </ListItem>

                    {open ? (
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
                              class={
                                version.available
                                  ? "ckpt-version"
                                  : "ckpt-version ckpt-version--gone"
                              }
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
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
