/**
 * Session commands — VS Code interactions for session management.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { Session, SessionDetail } from "./types";
import { parseSessionDetail } from "./parser";
import { deleteSession as deleteSessionState, loadState } from "./state";
import { getCurrentBranch } from "../../extension/git";
import { createTerminal } from "../../extension/terminal";
import { getWorkspace } from "../../extension/workspace";
import { normPath } from "../../core/utils";
import { PROJECTS_DIR } from "../../core/config";
import {
  slugifyProjectPath,
  validatePortableSession,
  rewriteSessionId,
  getKnownProjects,
  defaultExportFilename,
  type KnownProject,
} from "./portable";

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
  const term = createTerminal("Claude");
  term.show();
  term.sendText("claude");
}

/**
 * Continue the most recent Claude Code session in the current workspace.
 *
 * Wraps `claude --continue`, which Claude CLI resolves to the most recently
 * active session whose stored cwd matches the terminal's cwd. The terminal
 * is opened at the active workspace folder so the cwd lookup succeeds; if
 * no workspace is open, Claude is launched at its default working directory
 * and `--continue` will fall through to "no recent session" inside Claude.
 */
export function continueLastSession(): void {
  const cwd = getWorkspace();
  const term = createTerminal("Claude: continue", cwd || undefined);
  term.show();
  term.sendText("claude --continue");
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
 * Prompt the user for a new session name via an input box.
 * Pre-fills with the current name (if any) so editing is fast. Empty submission
 * clears the rename. Returns `null` if the user cancelled, or the trimmed value
 * (possibly empty string) if they confirmed.
 */
export async function promptRenameSession(
  sessionId: string,
  sessions: Session[],
): Promise<string | null> {
  const sess = sessions.find((s) => s.id === sessionId);
  const currentName = loadState().renames[sessionId] ?? sess?.name ?? "";
  const placeholder = sess?.summary
    ? sess.summary.slice(0, 60)
    : `session ${sessionId.slice(0, 8)}`;

  const result = await vscode.window.showInputBox({
    title: "Rename session",
    prompt: "Enter a new name (leave blank to clear the custom name)",
    value: currentName,
    placeHolder: placeholder,
    validateInput: (value: string) => {
      if (value.length > 80) return "Name must be 80 characters or fewer";
      return null;
    },
  });

  if (result === undefined) return null;
  return result;
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
  const termName = buildTerminalName(sess, sessionId);
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

      if (!choice) {
        return;
      }

      if (choice === "Switch & Resume") {
        const term = createTerminal(termName, cwd);
        term.show();
        term.sendText(`git checkout "${sessBranch}" && ${cmd}`);
        return;
      }
      // "Resume Anyway" falls through
    }
  }

  const term = createTerminal(termName, cwd);
  term.show();
  term.sendText(cmd);
}

/**
 * Build a human-friendly terminal name for a session.
 * Uses the user's rename if set, otherwise a short session-id label.
 * We deliberately avoid the first prompt — it's almost always too long for a
 * terminal tab and unhelpful when truncated.
 */
function buildTerminalName(sess: Session | undefined, sessionId: string): string {
  if (sess?.name) return `Claude: ${sess.name}`;
  return `Claude: ${sessionId.slice(0, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────
// Last-used folder memory for export/import dialogs.
// ─────────────────────────────────────────────────────────────────────
//
// Stored in extension globalState so the choice survives across workspaces.
// Two separate keys because exporting and importing tend to use different
// folders in practice (export → shared/Sync folder, import → Downloads).
// First-ever use returns undefined so the OS file picker shows its default.

/** Storage key for the last folder used as an export target. */
const STORAGE_KEY_LAST_EXPORT_DIR = "claudeManager.lastExportDir";
/** Storage key for the last folder used as an import source. */
const STORAGE_KEY_LAST_IMPORT_DIR = "claudeManager.lastImportDir";

/**
 * Module-level handle to the extension's persistent storage. Set once at
 * activate-time via `setSessionStorage`. Optional so unit tests can run
 * without a context — get/set become no-ops.
 */
let _storage: vscode.Memento | undefined;

/**
 * Wire the extension's globalState into the commands module. Called from
 * activate(). Without this the export/import dialogs still work but never
 * remember the last folder.
 */
export function setSessionStorage(storage: vscode.Memento): void {
  _storage = storage;
}

/**
 * Read a stored directory path, returning undefined if either the storage
 * is unwired (tests) or the path no longer exists on disk. Validating
 * existence prevents the dialog from opening at a stale / unmounted path.
 */
function readLastDir(key: string): string | undefined {
  const stored = _storage?.get<string>(key);
  if (!stored) return undefined;
  try {
    return fs.statSync(stored).isDirectory() ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** Persist the parent directory of a file the user just chose. */
function rememberLastDir(key: string, filePath: string): void {
  if (!_storage) return;
  const dir = path.dirname(filePath);
  void _storage.update(key, dir);
}

/**
 * Export a single session to a portable .jsonl file the user can carry to
 * another machine. The exported file is the raw session JSONL with no
 * rewriting — the import flow on the destination machine handles the
 * sessionId rewrite + slug placement.
 *
 * Steps:
 *   1. Resolve the source file path from the session's id.
 *   2. Open a Save dialog seeded with a friendly default filename and the
 *      last folder the user exported into (if it still exists).
 *   3. Copy the bytes verbatim.
 *   4. Remember the chosen folder for next time.
 *
 * Failures (file missing, permission denied, etc.) surface via a VS Code
 * error message — never silently swallowed.
 */
export async function exportSessionFile(
  sessionId: string,
  sessions: Session[],
): Promise<void> {
  const sess = sessions.find((s) => s.id === sessionId);
  if (!sess) {
    vscode.window.showErrorMessage("Session not found in the current list.");
    return;
  }

  const sourcePath = resolveSessionFilePath(sess);
  if (!sourcePath) {
    vscode.window.showErrorMessage(
      `Could not locate the session file for "${sess.name || sess.id.slice(0, 8)}".`,
    );
    return;
  }

  // Seed the dialog with the last export folder if we still have one.
  // Falls back to the OS default if the stored folder is missing.
  const lastDir = readLastDir(STORAGE_KEY_LAST_EXPORT_DIR);
  const defaultName = defaultExportFilename(sess);
  const defaultUri = vscode.Uri.file(
    lastDir ? path.join(lastDir, defaultName) : defaultName,
  );

  const targetUri = await vscode.window.showSaveDialog({
    title: "Export Claude session",
    defaultUri,
    filters: { "Claude Session": ["jsonl"] },
    saveLabel: "Export",
  });
  if (!targetUri) return; // user cancelled

  try {
    fs.copyFileSync(sourcePath, targetUri.fsPath);
    rememberLastDir(STORAGE_KEY_LAST_EXPORT_DIR, targetUri.fsPath);
    vscode.window.showInformationMessage(
      `Exported to ${path.basename(targetUri.fsPath)}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to export session: ${message}`);
  }
}

/**
 * Find the on-disk path of a session's JSONL file by scanning the project
 * slug derived from its `projectPath`. Returns null if the file can't be
 * located (e.g., the session was deleted from disk after the last scan).
 *
 * We could index this in the parser like `getSessionFile` does, but exports
 * are rare enough that a direct lookup keeps the data flow obvious.
 */
function resolveSessionFilePath(sess: Session): string | null {
  if (!sess.projectPath) return null;
  const slug = slugifyProjectPath(sess.projectPath);
  const candidate = path.join(PROJECTS_DIR, slug, `${sess.id}.jsonl`);
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Import a portable session file. Walks the user through:
 *
 *   1. File picker — restricted to .jsonl
 *   2. Validation — parse, count messages, reject mixed/empty/corrupt files
 *   3. Project picker — Current workspace (default) or any other project
 *      this extension already knows about
 *   4. Path verification — the chosen project's directory must exist on
 *      this machine, otherwise `claude --resume` cannot launch from it
 *   5. Confirmation — show the message count + target project so the user
 *      sees exactly what they're about to import
 *   6. Write — generate fresh UUID, rewrite internal sessionId, place the
 *      file under the target project's slug dir
 *   7. Launch — open a terminal at the target path and run claude --resume
 *
 * The session reload signal is sent via the `onImportComplete` callback so
 * the view provider can re-parse and refresh the webview.
 */
export async function importSessionFile(
  sessions: Session[],
  onImportComplete: () => void,
): Promise<void> {
  // 1. File picker — open at the last folder we imported from, if any.
  const lastImportDir = readLastDir(STORAGE_KEY_LAST_IMPORT_DIR);
  const picked = await vscode.window.showOpenDialog({
    title: "Import Claude session",
    defaultUri: lastImportDir ? vscode.Uri.file(lastImportDir) : undefined,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { "Claude Session": ["jsonl"] },
    openLabel: "Import",
  });
  if (!picked || picked.length === 0) return; // user cancelled

  const sourcePath = picked[0].fsPath;
  // Remember the source folder before we even validate — the user picked
  // a location they wanted, regardless of whether the file was valid.
  rememberLastDir(STORAGE_KEY_LAST_IMPORT_DIR, sourcePath);

  // 2. Validation
  let content: string;
  try {
    content = fs.readFileSync(sourcePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Could not read file: ${message}`);
    return;
  }

  const validation = validatePortableSession(content);
  if (!validation.ok) {
    vscode.window.showErrorMessage(`Cannot import: ${validation.reason}`);
    return;
  }

  // 3. Project picker
  const target = await pickImportTarget(sessions);
  if (!target) return; // user cancelled

  // 4. Path verification — the target dir must exist on this machine
  // because `claude --resume` is launched from a terminal at that cwd.
  if (!fs.existsSync(target.path)) {
    vscode.window.showErrorMessage(
      `The chosen project path does not exist on this machine:\n${target.path}\n\nPick a different project or choose Current Workspace.`,
    );
    return;
  }

  // 5. Confirmation — give the user one last chance to abort with the
  // message count + chosen project visible.
  const confirm = await vscode.window.showInformationMessage(
    `Import session into ${target.name}?`,
    {
      modal: true,
      detail:
        `${validation.userMessageCount} user message${validation.userMessageCount === 1 ? "" : "s"}, ` +
        `${validation.lineCount} total entries.\n\n` +
        `Target: ${target.path}\n\n` +
        `Claude will resume the conversation in a new terminal.`,
    },
    "Import & Resume",
  );
  if (confirm !== "Import & Resume") return;

  // 6. Write
  const newId = crypto.randomUUID();
  const slug = slugifyProjectPath(target.path);
  const targetDir = path.join(PROJECTS_DIR, slug);
  const targetFile = path.join(targetDir, `${newId}.jsonl`);

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    const rewritten = rewriteSessionId(content, validation.sessionId, newId);
    fs.writeFileSync(targetFile, rewritten);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to write imported session: ${message}`);
    return;
  }

  // 7. Launch
  const term = createTerminal(`Claude: imported ${newId.slice(0, 8)}`, target.path);
  term.show();
  term.sendText(`claude --resume ${newId}`);

  // Tell the view provider to re-scan so the imported session shows up
  // in the list (it lives under target.path's slug, not necessarily the
  // current workspace).
  onImportComplete();
}

/**
 * Show a QuickPick that lets the user choose a target project for an
 * import. The current workspace (if any) is offered as the default top
 * entry. Falls back to "no workspace open" if neither is available.
 *
 * Returns the chosen {name, path} or null if the user cancelled.
 */
async function pickImportTarget(sessions: Session[]): Promise<KnownProject | null> {
  const ws = getWorkspace();
  const known = getKnownProjects(sessions);
  // Strip the current workspace from "known" so it does not appear twice.
  const others = ws ? known.filter((p) => normPath(p.path) !== normPath(ws)) : known;

  type Item = vscode.QuickPickItem & { project?: KnownProject };
  const items: Item[] = [];

  if (ws) {
    items.push({
      label: "$(folder-active) Current Workspace",
      description: path.basename(ws),
      detail: ws,
      project: { name: path.basename(ws), path: ws },
    });
  }

  if (others.length > 0) {
    items.push({ label: "Other Projects", kind: vscode.QuickPickItemKind.Separator });
    for (const p of others) {
      items.push({
        label: `$(folder) ${p.name}`,
        detail: p.path,
        project: p,
      });
    }
  }

  if (items.length === 0) {
    vscode.window.showErrorMessage(
      "No workspace open and no known projects to import into. Open a folder first.",
    );
    return null;
  }

  const choice = await vscode.window.showQuickPick(items, {
    title: "Import session into which project?",
    placeHolder: "Pick the target project — its directory must exist on this machine",
    matchOnDetail: true,
  });
  return choice?.project ?? null;
}
