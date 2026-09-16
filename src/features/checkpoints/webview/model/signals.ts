/**
 * Reactive state for the File Checkpoints tab.
 *
 * Two levels: the list of sessions that have recorded checkpoints, and the
 * tracked files of whichever session is selected. Source state lives in
 * `signal()`; anything derived (the search-filtered file list, the selected
 * session record) is a `computed` so views never filter inline.
 */
import { computed, signal } from "@preact/signals";
import type { CheckpointFile, CheckpointSessionSummary } from "../../types";
import { filterCheckpointFiles, filterCheckpointSessions } from "../lib";

/** Every session with checkpoint history, newest backup first. */
export const sessions = signal<CheckpointSessionSummary[]>([]);

/** Selected session id, or null while the session list is showing. */
export const selectedSessionId = signal<string | null>(null);

/** Tracked files of the selected session. */
export const files = signal<CheckpointFile[]>([]);

/** Blobs in the selected session's directory no transcript line maps to. */
export const orphanCount = signal<number>(0);

/** True until the first `checkpointSessions` message lands. */
export const loadingSessions = signal<boolean>(true);

/** True while a session's file list is in flight. */
export const loadingFiles = signal<boolean>(false);

/** Host-reported error message, or null when healthy. */
export const errorMessage = signal<string | null>(null);

/** Free-text filter over the session list. */
export const sessionQuery = signal<string>("");

/** Free-text filter over the selected session's file list. */
export const fileQuery = signal<string>("");

/** Path of the file whose version list is expanded, or null when none is. */
export const expandedPath = signal<string | null>(null);

/** The selected session's summary record, or null. */
export const selectedSession = computed<CheckpointSessionSummary | null>(() => {
  const id = selectedSessionId.value;
  if (id === null) return null;
  return sessions.value.find((s) => s.sessionId === id) ?? null;
});

/** Sessions after the search filter. */
export const filteredSessions = computed<CheckpointSessionSummary[]>(() =>
  filterCheckpointSessions(sessions.value, sessionQuery.value),
);

/** Tracked files after the search filter. */
export const filteredFiles = computed<CheckpointFile[]>(() =>
  filterCheckpointFiles(files.value, fileQuery.value),
);

/** Replace the session list and clear its loading state. */
export function applySessions(next: CheckpointSessionSummary[]): void {
  sessions.value = next;
  loadingSessions.value = false;
  errorMessage.value = null;
}

/**
 * Replace the file list for `sessionId`.
 *
 * Ignored when it is not the session the user is currently looking at: the
 * user can select a second session while the first reply is still in flight,
 * and a late reply must not overwrite the newer view.
 */
export function applyCheckpoints(
  sessionId: string,
  next: CheckpointFile[],
  orphans: number,
): void {
  if (selectedSessionId.value !== sessionId) return;
  files.value = next;
  orphanCount.value = orphans;
  loadingFiles.value = false;
  errorMessage.value = null;
}

/** Record a host error and stop both loading states. */
export function applyError(message: string): void {
  errorMessage.value = message;
  loadingSessions.value = false;
  loadingFiles.value = false;
}

/** Reset every signal to its initial value. Used in tests. */
export function resetCheckpointSignals(): void {
  sessions.value = [];
  selectedSessionId.value = null;
  files.value = [];
  orphanCount.value = 0;
  loadingSessions.value = true;
  loadingFiles.value = false;
  errorMessage.value = null;
  sessionQuery.value = "";
  fileQuery.value = "";
  expandedPath.value = null;
}
