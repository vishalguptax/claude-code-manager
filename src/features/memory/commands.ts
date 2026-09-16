/**
 * Extension-host commands for the Memory browser: open a memory in the
 * editor, reveal it in the OS file manager, and delete it.
 *
 * ## Trust
 *
 * The webview never names a path. It sends `(project, fileName)` and the host
 * re-derives the absolute path through {@link memoryPathFor}, whose anchored
 * grammars admit no separator and no `..`. A compromised webview therefore
 * cannot address anything outside a project's `memory` directory — which
 * matters most for {@link deleteMemory}, the one irreversible action here.
 */
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { memoryPathFor } from "./parser";
import type { MemoryDeleteResult } from "./types";

/**
 * Absolute path of a memory that is really on disk, or `null`.
 *
 * `lstatSync`, not `statSync`: a symlink planted in the memory directory must
 * not resolve to a target outside it. The parser refuses to list one, and
 * refusing it here too means a stale webview row cannot act on it either.
 */
export function resolveMemoryPath(project: string, fileName: string): string | null {
  const filePath = memoryPathFor(project, fileName);
  if (filePath === null) return null;
  try {
    return fs.lstatSync(filePath).isFile() ? filePath : null;
  } catch {
    return null;
  }
}

/** Message for a `(project, fileName)` pair that addresses nothing. */
function reportUnresolved(fileName: string): void {
  vscode.window.showErrorMessage(
    `Could not find the memory "${fileName}" — it may have been deleted or moved.`,
  );
}

/** Open a memory in an editor tab. @returns true when something opened. */
export async function openMemory(project: string, fileName: string): Promise<boolean> {
  const filePath = resolveMemoryPath(project, fileName);
  if (filePath === null) {
    reportUnresolved(fileName);
    return false;
  }
  try {
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    return true;
  } catch {
    vscode.window.showErrorMessage(`Could not open ${filePath}`);
    return false;
  }
}

/**
 * Reveal a memory in Finder / Explorer / the desktop file manager.
 *
 * `revealFileInOS` is a built-in VS Code command rather than a shell-out, so
 * there is no command line to quote and no platform branch to maintain.
 */
export async function revealMemory(project: string, fileName: string): Promise<boolean> {
  const filePath = resolveMemoryPath(project, fileName);
  if (filePath === null) {
    reportUnresolved(fileName);
    return false;
  }
  try {
    await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(filePath));
    return true;
  } catch {
    vscode.window.showErrorMessage(`Could not reveal ${filePath}`);
    return false;
  }
}

/**
 * Delete one memory file.
 *
 * **Destructive and not undoable from here.** It therefore never runs without
 * a modal confirmation naming the exact file and its directory — a dismissible
 * toast is not consent — and the detail warns about the index, because
 * removing the file leaves its `MEMORY.md` line pointing at nothing. That
 * dangling line is not silently repaired: rewriting a file Claude Code owns
 * behind the user's back would be a worse surprise than an entry the browser
 * already flags as unresolved.
 */
export async function deleteMemory(
  project: string,
  fileName: string,
): Promise<MemoryDeleteResult> {
  const filePath = memoryPathFor(project, fileName);
  if (filePath === null) {
    vscode.window.showErrorMessage("That memory could not be identified.");
    return { ok: false, reason: "invalid" };
  }
  if (resolveMemoryPath(project, fileName) === null) {
    reportUnresolved(fileName);
    return { ok: false, reason: "missing" };
  }

  const choice = await vscode.window.showWarningMessage(
    `Delete the memory "${fileName}"?`,
    {
      modal: true,
      detail: [
        `${filePath} will be permanently deleted.`,
        "If MEMORY.md lists this file, that entry is left in place and will show as unresolved until Claude Code rewrites the index.",
      ].join("\n\n"),
    },
    "Delete",
  );
  if (choice !== "Delete") return { ok: false, reason: "cancelled" };

  try {
    fs.rmSync(filePath, { force: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Could not delete ${filePath}: ${message}`);
    return { ok: false, reason: "delete-failed" };
  }

  vscode.window.showInformationMessage(`Deleted ${path.basename(filePath)}.`);
  return { ok: true };
}
