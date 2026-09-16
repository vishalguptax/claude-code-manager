/**
 * File Checkpoints feature barrel — exports the parser, the host message
 * handler, and the checkpoint domain types.
 */
export {
  hashFilePath,
  listCheckpointSessions,
  listFileVersions,
  parseSessionCheckpoints,
  readCheckpointBlob,
} from "./parser";
export {
  disposeCheckpointProvider,
  openCheckpointDiff,
  restoreCheckpoint,
} from "./commands";
export { handleCheckpointsMessage } from "./messageHandlers";
export type { CheckpointsHostContext } from "./messageHandlers";
export type {
  CheckpointFile,
  CheckpointSessionSummary,
  CheckpointVersion,
  RestoreResult,
  SessionCheckpoints,
} from "./types";
