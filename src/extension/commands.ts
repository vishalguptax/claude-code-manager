import * as vscode from "vscode";
import { Session, SessionDetail } from "./types";
import { parseSessionDetail } from "./sessionParser";
import { loadState, deleteSession as deleteSessionState } from "./state";
import { getCurrentBranch } from "./git";
import { normPath, getWorkspace, createTerminal } from "./utils";

/**
 * Open a project folder in a new VS Code window.
 */
export function openProject(projectPath: string): void {
  vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(projectPath),
    { forceNewWindow: true },
  );
}

/**
 * Start a new Claude session in a new terminal.
 */
export function newSession(): void {
  createTerminal("Claude").sendText("claude");
}

/**
 * Copy the resume command for a session to the clipboard and show a notification.
 */
export function copyResumeCommand(sessionId: string): void {
  const cmd = `claude --resume ${sessionId}`;
  vscode.env.clipboard.writeText(cmd);
  vscode.window.showInformationMessage(`Copied: ${cmd}`);
}

/**
 * Copy the full session transcript as Markdown to the clipboard.
 * Returns true if successful, false if the session or detail could not be found.
 */
export function copyMarkdown(sessionId: string, sessions: Session[]): boolean {
  const sess = sessions.find((s) => s.id === sessionId);
  const detail = parseSessionDetail(sessionId, sess);
  if (!detail) {
    return false;
  }
  const markdown = detail.messages
    .map((m) => `## ${m.role === "user" ? "You" : "Claude"}\n\n${m.content}`)
    .join("\n\n---\n\n");
  vscode.env.clipboard.writeText(markdown);
  vscode.window.showInformationMessage("Copied as Markdown");
  return true;
}

/**
 * Show a confirmation dialog for deleting a session.
 * If confirmed, updates state and optionally navigates to the list view.
 *
 * Returns the updated user state if deletion was confirmed, or null if cancelled.
 */
export async function confirmDeleteSession(
  sessionId: string,
  callback?: string,
): Promise<{ pinned: string[]; deleted: string[]; navigateToList: boolean } | null> {
  const choice = await vscode.window.showWarningMessage(
    "Delete this session from the list?",
    {
      modal: true,
      detail: "This will hide the session from your list. Claude's original data won't be modified.",
    },
    "Delete",
  );

  if (choice !== "Delete") {
    return null;
  }

  const state = deleteSessionState(sessionId);
  return {
    pinned: state.pinned,
    deleted: state.deleted,
    navigateToList: callback === "showList",
  };
}

/**
 * Resume or fork a Claude session in a terminal.
 *
 * Handles three scenarios:
 * 1. Session belongs to a different project - opens that project in a new window
 * 2. Session was on a different git branch - prompts user to switch or resume anyway
 * 3. Normal case - opens terminal and runs the resume command
 */
export async function resumeSession(sessionId: string, fork: boolean, sessions: Session[]): Promise<void> {
  const sess = sessions.find((s) => s.id === sessionId);
  const cwd = sess?.projectPath ?? "";
  const sessBranch = sess?.branch ?? "";
  const cmd = fork
    ? `claude --resume ${sessionId} --fork-session`
    : `claude --resume ${sessionId}`;
  const ws = getWorkspace();

  // Different project: open that project window
  if (ws && cwd && normPath(cwd) !== normPath(ws)) {
    openProject(cwd);
    return;
  }

  // Same project or no workspace: check branch before resuming
  if (sessBranch && sessBranch !== "HEAD") {
    const currentBranch = getCurrentBranch();
    if (currentBranch && currentBranch !== sessBranch) {
      const choice = await vscode.window.showWarningMessage(
        `This session was on branch "${sessBranch}", but you're on "${currentBranch}".`,
        {
          modal: true,
          detail: "The session may not work correctly on a different branch.",
        },
        "Switch & Resume",
        "Resume Anyway",
      );

      if (!choice || choice === "Cancel") {
        return;
      }

      if (choice === "Switch & Resume") {
        const term = createTerminal(`Claude: ${sessionId.slice(0, 8)}`, cwd);
        term.sendText(`git checkout "${sessBranch}" && ${cmd}`);
        return;
      }
      // "Resume Anyway" falls through
    }
  }

  createTerminal(`Claude: ${sessionId.slice(0, 8)}`, cwd).sendText(cmd);
}
