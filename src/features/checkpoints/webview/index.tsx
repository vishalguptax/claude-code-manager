/**
 * File Checkpoints tab entry. Wires the message bus to the feature signals,
 * requests the session list on mount, and renders either the session list or
 * the selected session's file history.
 *
 * Every host send goes through the validated `createCheckpointsApi` wrapper.
 * Restore is deliberately fire-and-forget from here: the host owns the modal
 * confirmation and the write, so this component never learns enough to skip
 * the confirmation.
 */
import { useCallback, useEffect, useMemo } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import {
  activeTab,
  registerFeatureHandler,
  registerPaletteSource,
} from "../../../webview/shared/model";
import { ListSkeleton } from "../../../webview/shared/ui";
import type { CheckpointFile, CheckpointSessionSummary } from "../types";
import { createCheckpointsApi } from "./api";
import {
  applyCheckpoints,
  applyError,
  applySessions,
  expandedPath,
  fileQuery,
  loadingFiles,
  loadingSessions,
  selectedSessionId,
  sessions,
} from "./model";
import { CheckpointFiles, CheckpointSessions } from "./ui";

/**
 * How many sessions to offer the palette. The palette scores every item on
 * every keystroke and shows at most 50 after ranking, so a user with years of
 * file history pays for rows that can never be shown.
 */
const PALETTE_SESSIONS = 200;

export default function CheckpointsTab() {
  const { post } = useApi();
  const api = useMemo(() => createCheckpointsApi(post), [post]);

  /**
   * Open one session's file history. Resets the previous session's filter and
   * expansion so the new list opens at the top rather than mid-search, then
   * asks the host for the files. Shared by the list row and the palette, so
   * both routes land the user in exactly the same state.
   */
  const openSession = useCallback(
    (sessionId: string): void => {
      selectedSessionId.value = sessionId;
      fileQuery.value = "";
      expandedPath.value = null;
      loadingFiles.value = true;
      api.getCheckpoints(sessionId);
    },
    [api],
  );

  useEffect(() => {
    // One prefix covers both host replies: "checkpoints" and
    // "checkpointSessions" each begin with "checkpoint".
    const unsubscribe = registerFeatureHandler("checkpoint", (msg) => {
      if (msg.type === "checkpointSessions") {
        applySessions((msg.data ?? []) as CheckpointSessionSummary[]);
      } else if (msg.type === "checkpoints") {
        applyCheckpoints(msg.sessionId, (msg.data ?? []) as CheckpointFile[], msg.orphanCount);
      }
    });
    const unsubscribeError = registerFeatureHandler("error", (msg) => {
      if (msg.type === "error") applyError(msg.message);
    });
    // Sessions with file history in the command palette. The source is called
    // per query, so it always reads the live signal without this module
    // subscribing to it.
    const unsubscribePalette = registerPaletteSource("checkpoints", () =>
      sessions.value.slice(0, PALETTE_SESSIONS).map((s) => ({
        id: `checkpoints:${s.sessionId}`,
        title: s.label,
        subtitle: `${s.fileCount} ${s.fileCount === 1 ? "file" : "files"}`,
        group: "Checkpoints",
        icon: "history",
        hint: s.project || undefined,
        run: () => {
          activeTab.value = "checkpoints";
          openSession(s.sessionId);
        },
      })),
    );
    api.getSessions();
    return () => {
      unsubscribe();
      unsubscribeError();
      unsubscribePalette();
    };
  }, [api, openSession]);

  const sessionId = selectedSessionId.value;

  if (loadingSessions.value && sessionId === null) return <ListSkeleton />;

  if (sessionId !== null) {
    return (
      <CheckpointFiles
        onBack={() => {
          selectedSessionId.value = null;
          expandedPath.value = null;
          fileQuery.value = "";
        }}
        onOpenFile={(path) => api.openFile(path)}
        onDiff={(filePath, version) => api.diff(sessionId, filePath, version)}
        onRestore={(filePath, version) => api.restore(sessionId, filePath, version)}
      />
    );
  }

  return <CheckpointSessions onSelect={openSession} onRefresh={() => api.getSessions()} />;
}

export { CheckpointsTab };
