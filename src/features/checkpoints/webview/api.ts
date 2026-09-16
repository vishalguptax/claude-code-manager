/**
 * Typed webview → host message senders for the File Checkpoints feature.
 *
 * Every send is validated against the shared protocol schema before it leaves
 * the webview, so shape drift fails loudly in tests and dev rather than
 * silently reaching a host that will drop it.
 *
 * Note what is NOT sent: a blob filename. The webview names a file and a
 * version; the host derives the blob path itself. Keeping the blob grammar
 * host-side is what stops a webview-supplied string from addressing anything
 * in the history tree.
 */
import { parseMessage } from "../../../shared/protocol/schemas";
import type { WebviewMessage } from "../../../shared/protocol/messages";

/** Checkpoint sends available to the tab. */
export interface CheckpointsApi {
  /** Ask for every session that has recorded checkpoints. */
  getSessions(): void;
  /** Ask for one session's tracked files and their versions. */
  getCheckpoints(sessionId: string): void;
  /** Open a diff of one version against the working file. */
  diff(sessionId: string, filePath: string, version: number): void;
  /** Ask the host to restore one version. The host confirms before writing. */
  restore(sessionId: string, filePath: string, version: number): void;
  /** Open the working file in an editor. */
  openFile(path: string): void;
}

/** Validate then post a webview message via the host bridge. */
function send(post: (m: unknown) => void, msg: WebviewMessage): void {
  post(parseMessage(msg));
}

/** Wrap the raw `post` from `useApi()` in checkpoint-specific typed senders. */
export function createCheckpointsApi(post: (m: unknown) => void): CheckpointsApi {
  return {
    getSessions() {
      send(post, { type: "getCheckpointSessions" });
    },
    getCheckpoints(sessionId) {
      send(post, { type: "getCheckpoints", sessionId });
    },
    diff(sessionId, filePath, version) {
      send(post, { type: "diffCheckpoint", sessionId, filePath, version });
    },
    restore(sessionId, filePath, version) {
      send(post, { type: "restoreCheckpoint", sessionId, filePath, version });
    },
    openFile(path) {
      send(post, { type: "openFile", path });
    },
  };
}
