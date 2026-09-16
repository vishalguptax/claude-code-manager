/**
 * Typed webview → host message senders for the Memory browser.
 *
 * Unlike the other features' `api.ts`, these do NOT run through
 * `parseMessage` from `src/shared/protocol/schemas.ts`: memory's message
 * types are not variants of the shared union yet, and validating against a
 * schema that does not know them would reject every send. The shapes are
 * still typed against {@link MemoryRequest}, which is the same type the host
 * handler narrows to, so the two sides cannot drift silently.
 *
 * Note what is NOT sent: an absolute path. The webview names a project and a
 * file; the host re-derives the path behind its own traversal guard. That is
 * what keeps a webview-supplied string from addressing anything outside the
 * memory directory — which matters for `deleteMemory` above all.
 */
import type { MemoryRequest } from "../types";

/** Memory sends available to the tab. */
export interface MemoryApi {
  /** Ask for the whole store. The host replies with `memoryStore`. */
  getMemories(): void;
  /** Open one memory in an editor tab. */
  open(project: string, fileName: string): void;
  /** Reveal one memory in the OS file manager. */
  reveal(project: string, fileName: string): void;
  /** Ask the host to delete one memory. The host confirms before removing it. */
  remove(project: string, fileName: string): void;
}

/** Wrap the raw `post` from `useApi()` in memory-specific typed senders. */
export function createMemoryApi(post: (m: MemoryRequest) => void): MemoryApi {
  return {
    getMemories() {
      post({ type: "getMemories" });
    },
    open(project, fileName) {
      post({ type: "openMemory", project, fileName });
    },
    reveal(project, fileName) {
      post({ type: "revealMemory", project, fileName });
    },
    remove(project, fileName) {
      post({ type: "deleteMemory", project, fileName });
    },
  };
}
