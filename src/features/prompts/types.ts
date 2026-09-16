/**
 * Domain + protocol types for the Prompt History feature.
 *
 * Claude Code appends one JSON object per prompt to `~/.claude/history.jsonl`,
 * across every project, forever. The shape observed in the wild (CLI 2.x) is:
 *
 *   {"display":"…","pastedContents":{},"timestamp":1783156548849,
 *    "project":"/abs/path","sessionId":"<uuid>"}
 *
 * Every field is typed optional here regardless: the file is the CLI's, not
 * ours, and a schema change must degrade to a missing badge, never a crash.
 *
 * Everything that crosses postMessage is plain JSON — no Date, no Map.
 */

/**
 * One raw line of `history.jsonl`, exactly as the CLI writes it.
 *
 * Deliberately NOT re-exported to the webview: `pastedContents` is the
 * unbounded field (it holds whole pasted files) and must never reach the
 * list model. {@link PromptEntry} is what the webview sees.
 */
export interface RawHistoryLine {
  display?: unknown;
  timestamp?: unknown;
  project?: unknown;
  sessionId?: unknown;
  pastedContents?: unknown;
}

/**
 * One row of the prompt list — a single prompt, or a run of consecutive
 * identical retries collapsed into one row.
 *
 * Note what is absent: the pasted blobs themselves. A prompt that carried a
 * 4 MB paste contributes two integers here, not 4 MB.
 */
export interface PromptEntry {
  /**
   * `<sessionId>#<lineIndex>` of the first occurrence. `history.jsonl` is
   * append-only, so a line's index is a stable identity — safe as a list key
   * across refreshes in a way an array position is not.
   */
  id: string;
  /** The prompt text as typed. */
  text: string;
  /** Epoch ms of the MOST RECENT occurrence (the list is newest-first). */
  timestamp: number;
  /** Absolute project directory the prompt was typed in. `""` when unrecorded. */
  projectPath: string;
  /** Last path segment of `projectPath`, for display. */
  projectName: string;
  /** Session the prompt belongs to. `""` when unrecorded. */
  sessionId: string;
  /** How many consecutive identical prompts this row stands for. 1 = no repeat. */
  repeatCount: number;
  /** Number of `pastedContents` attachments on the first occurrence. */
  attachmentCount: number;
  /**
   * Total characters across those attachments. A size hint for the badge —
   * the content itself stays on disk.
   */
  attachmentChars: number;
}

/** Webview → host messages owned by the Prompt History feature. */
export type PromptsWebviewMessage =
  | { type: "getPromptHistory" }
  | { type: "copyPrompt"; text: string }
  | { type: "openPromptSession"; sessionId: string };

/** Host → webview messages owned by the Prompt History feature. */
export type PromptsExtensionMessage = {
  type: "promptHistory";
  data: PromptEntry[];
};
