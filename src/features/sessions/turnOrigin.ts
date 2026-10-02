/**
 * Tells the person's own prompts apart from the `user`-role records
 * Claude Code writes on their behalf.
 *
 * The transcript stores every model input as `role: "user"`: what the
 * person typed, but also background-task notifications, messages from
 * another session, MCP channel pushes, and `isMeta` context (skill
 * bodies, command caveats). Treating all of them as prompts showed a task
 * notification as "You" in the detail view, and could make one the
 * session's first prompt, title, prompt count and search text.
 *
 * Classification rides on the fields the CLI writes for exactly this
 * (verified on 2.1.287 transcripts): `origin.kind` ("human" on every
 * typed, queued, suggestion-accepted or SDK prompt), the older
 * `turnOrigin`, and `isMeta`. A record carrying none of them predates
 * the fields and is taken as human, which is what it was then treated as.
 *
 * Pure, no IO.
 */
import type { InjectedTurnKind, SessionEntry } from "./types";

type OriginFields = Pick<SessionEntry, "isMeta" | "origin" | "turnOrigin">;

/**
 * How an injected record is named wherever a transcript is shown — the
 * detail view's role label and the Markdown export's heading — so the two
 * never disagree about who said it. Pure data; safe for the webview.
 */
export const INJECTED_TURN_LABELS: Record<InjectedTurnKind, string> = {
  "task-notification": "Task notification",
  peer: "Message from another session",
  channel: "Channel message",
  system: "Added by Claude Code",
};

/** The injected kind of a `user`-role record, or null for a human prompt. */
export function injectedTurnKind(entry: OriginFields): InjectedTurnKind | null {
  const kind = entry.origin?.kind;
  if (kind === "task-notification" || entry.turnOrigin === "task_notification") {
    return "task-notification";
  }
  // Peer messages arrive with `isMeta: true` too, so they are named
  // before the generic meta check swallows them.
  if (kind === "peer" || entry.turnOrigin === "peer") return "peer";
  if (kind === "channel") return "channel";
  if (entry.isMeta === true) return "system";
  if (kind === undefined || kind === "human") return null;
  // Any other kind the CLI names is, by naming it, not the person.
  return "system";
}

/**
 * True for a record that is something the person asked: a main-thread
 * `user` record, not injected, carrying more than tool results (Claude
 * Code also files tool output under `role: "user"`).
 */
export function isHumanPrompt(entry: SessionEntry): boolean {
  if (entry.message?.role !== "user" || entry.isSidechain) return false;
  if (injectedTurnKind(entry) !== null) return false;
  const content = entry.message.content;
  if (typeof content === "string") return true;
  return Array.isArray(content) && content.some((b) => b.type !== "tool_result");
}
