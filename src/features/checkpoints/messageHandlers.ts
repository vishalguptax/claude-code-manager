/**
 * Host-side message dispatch for the File Checkpoints feature.
 *
 * Mirrors `features/mcp/messageHandlers.ts`: every inbound message is
 * validated against the shared valibot schema before it is acted on, and the
 * handler depends only on a narrow {@link CheckpointsHostContext} so it never
 * reaches into another feature's provider. The sessions panel builds that
 * context and delegates checkpoint messages here.
 */
import * as vscode from "vscode";
import type { PanelSink } from "../../extension/panelSink";
import { parseMessage } from "../../shared/protocol/schemas";
import { openCheckpointDiff, restoreCheckpoint } from "./commands";
import { listCheckpointSessions, parseSessionCheckpoints } from "./parser";

/** Narrow host surface the checkpoints handler needs. */
export interface CheckpointsHostContext {
  /** The live webview, or undefined when the view is not resolved. */
  getWebview(): PanelSink | undefined;
  /**
   * Display name + project folder for a session id, from the host's cached
   * session list. Undefined when the transcript is no longer on disk — the
   * blobs outlive it, so the row still renders under its short id.
   */
  describeSession(sessionId: string): { label: string; project: string } | undefined;
  /** Absolute path of a session's transcript, or null when it is gone. */
  transcriptPath(sessionId: string): string | null;
}

/**
 * Message types this feature owns. Used only to decide whether a message that
 * FAILED schema validation was ours to reject or someone else's to try.
 */
const CHECKPOINT_TYPES: ReadonlySet<string> = new Set([
  "getCheckpointSessions",
  "getCheckpoints",
  "diffCheckpoint",
  "restoreCheckpoint",
]);

/**
 * Validate and handle one checkpoints webview→host message.
 *
 * @returns `true` if the message was a checkpoints message (handled or
 *   rejected), `false` if the caller should try other handlers.
 */
export async function handleCheckpointsMessage(
  raw: unknown,
  ctx: CheckpointsHostContext,
): Promise<boolean> {
  let msg: ReturnType<typeof parseMessage>;
  try {
    msg = parseMessage(raw);
  } catch (err) {
    const type = (raw as { type?: unknown } | null)?.type;
    if (typeof type === "string" && CHECKPOINT_TYPES.has(type)) {
      console.error("[claude-manager] rejected malformed checkpoints message", err);
      return true;
    }
    return false;
  }

  const wv = ctx.getWebview();

  switch (msg.type) {
    case "getCheckpointSessions": {
      if (!wv) return true;
      // Directory listing only — no transcript is read here, so this stays
      // cheap with dozens of sessions. Labels come from the host's cached
      // session list; a session whose transcript is gone keeps its short id.
      const data = listCheckpointSessions().map((summary) => {
        const described = ctx.describeSession(summary.sessionId);
        return described ? { ...summary, ...described } : summary;
      });
      wv.postMessage({ type: "checkpointSessions", data });
      return true;
    }

    case "getCheckpoints": {
      if (!wv) return true;
      const result = parseSessionCheckpoints(
        msg.sessionId,
        ctx.transcriptPath(msg.sessionId),
      );
      wv.postMessage({
        type: "checkpoints",
        sessionId: result.sessionId,
        data: result.files,
        orphanCount: result.orphanCount,
      });
      return true;
    }

    case "diffCheckpoint": {
      await openCheckpointDiff(msg.sessionId, msg.filePath, msg.version);
      return true;
    }

    case "restoreCheckpoint": {
      await restoreCheckpoint(msg.sessionId, msg.filePath, msg.version);
      return true;
    }

    default:
      return false;
  }
}
