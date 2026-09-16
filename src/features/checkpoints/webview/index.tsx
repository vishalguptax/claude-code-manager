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
import { useEffect, useMemo } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { ListSkeleton } from "../../../webview/shared/ui";
import type { CheckpointFile, CheckpointSessionSummary } from "../types";
import { createCheckpointsApi } from "./api";
import {
  applyCheckpoints,
  applyError,
  applySessions,
  expandedPath,
  loadingFiles,
  loadingSessions,
  searchQuery,
  selectedSessionId,
} from "./model";
import { CheckpointFiles, CheckpointSessions } from "./ui";

export default function CheckpointsTab() {
  const { post } = useApi();
  const api = useMemo(() => createCheckpointsApi(post), [post]);

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
    api.getSessions();
    return () => {
      unsubscribe();
      unsubscribeError();
    };
  }, [api]);

  const sessionId = selectedSessionId.value;

  if (loadingSessions.value && sessionId === null) return <ListSkeleton />;

  if (sessionId !== null) {
    return (
      <CheckpointFiles
        onBack={() => {
          selectedSessionId.value = null;
          expandedPath.value = null;
          searchQuery.value = "";
        }}
        onOpenFile={(path) => api.openFile(path)}
        onDiff={(filePath, version) => api.diff(sessionId, filePath, version)}
        onRestore={(filePath, version) => api.restore(sessionId, filePath, version)}
      />
    );
  }

  return (
    <CheckpointSessions
      onSelect={(id) => {
        selectedSessionId.value = id;
        // Selecting clears the previous session's filter + expansion so the
        // new list opens at the top rather than mid-filter.
        searchQuery.value = "";
        expandedPath.value = null;
        loadingFiles.value = true;
        api.getCheckpoints(id);
      }}
      onRefresh={() => api.getSessions()}
    />
  );
}

export { CheckpointsTab };
