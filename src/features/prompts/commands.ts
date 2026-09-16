/**
 * Extension-host actions for the Prompt History feature.
 *
 * Two things a user wants from an old prompt: the text back, or the session
 * it came from. Both are one-liners on the VS Code surface; they live here
 * rather than inline in the dispatch so the handler stays a switch.
 */
import * as vscode from "vscode";

/** Longest prompt excerpt echoed in the confirmation toast. */
const TOAST_EXCERPT_CHARS = 60;

/**
 * Put a prompt on the clipboard and confirm it.
 *
 * The toast quotes the first line only, elided: prompts run to thousands of
 * characters and a multi-line notification covers the editor.
 */
export async function copyPromptToClipboard(text: string): Promise<void> {
  if (!text) {
    vscode.window.showErrorMessage("That prompt has no text to copy.");
    return;
  }
  await vscode.env.clipboard.writeText(text);

  const firstLine = text.split("\n", 1)[0] ?? "";
  const excerpt =
    firstLine.length > TOAST_EXCERPT_CHARS
      ? `${firstLine.slice(0, TOAST_EXCERPT_CHARS)}…`
      : firstLine;
  vscode.window.showInformationMessage(
    excerpt ? `Copied prompt: ${excerpt}` : "Copied prompt to clipboard",
  );
}

/**
 * Open the session a prompt belongs to.
 *
 * The resume path itself belongs to the sessions feature — it resolves the
 * project, the worktree and the branch before it launches anything. This
 * feature does not reimplement or import it: `resume` is supplied by the
 * host context, which the provider binds to the existing session resume.
 *
 * A prompt whose line never recorded a `sessionId` (a CLI shape we have not
 * seen, but the file is not ours) has nothing to open, and says so instead of
 * launching a resume for the empty string.
 */
export async function openPromptSession(
  sessionId: string,
  resume: (sessionId: string) => Promise<void>,
): Promise<void> {
  if (!sessionId) {
    vscode.window.showErrorMessage(
      "This prompt is not linked to a session — Claude Code recorded it without a session id.",
    );
    return;
  }
  await resume(sessionId);
}
