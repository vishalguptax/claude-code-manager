/**
 * Extension-host commands for File Checkpoints: diff a recorded version
 * against the working file, and restore one over it.
 *
 * ## Serving blob contents
 *
 * Blobs are served to the diff editor through a
 * `TextDocumentContentProvider` on the `claude-checkpoint` scheme rather than
 * being copied into temp files. Temp copies would double ~28 MB of history on
 * disk, leak on crash, and give the diff editor a path that lies about where
 * the content came from. The URI's *path* is the real file's path, so VS Code
 * picks the right language mode and the diff title reads naturally; the
 * session and blob identity ride in the query.
 *
 * ## Trust
 *
 * The webview never names a blob. It sends `(sessionId, filePath, version)`
 * and the host re-derives `sha256(filePath).slice(0,16) + "@v" + version`
 * itself, so a compromised webview cannot point the host at an arbitrary file
 * inside the history tree — and the anchored grammars in `parser.ts` keep it
 * from pointing outside.
 */
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { blobPath, hashFilePath, isValidSessionId, readCheckpointBlob } from "./parser";
import type { RestoreResult } from "./types";

/** Custom scheme the checkpoint content provider is registered on. */
export const CHECKPOINT_SCHEME = "claude-checkpoint";

/** Shown in the diff pane when a blob vanished between listing and opening. */
const UNAVAILABLE_NOTICE =
  "This checkpoint is no longer on disk. Claude Code prunes ~/.claude/file-history on its cleanupPeriodDays schedule.";

/** Blob filename for one version of one file. The host's own derivation. */
export function backupNameFor(filePath: string, version: number): string {
  return `${hashFilePath(filePath)}@v${version}`;
}

/**
 * True when the arguments could address a real blob: a canonical session id,
 * an absolute file path, and a positive integer version.
 */
export function isValidTarget(
  sessionId: string,
  filePath: string,
  version: number,
): boolean {
  return (
    isValidSessionId(sessionId) &&
    typeof filePath === "string" &&
    path.isAbsolute(filePath) &&
    Number.isSafeInteger(version) &&
    version >= 1
  );
}

/**
 * URI addressing one checkpoint version. The path is the working file's path
 * (language mode + a readable diff title); the query carries the identity the
 * content provider needs.
 */
export function checkpointUri(
  sessionId: string,
  filePath: string,
  version: number,
): vscode.Uri {
  return vscode.Uri.from({
    scheme: CHECKPOINT_SCHEME,
    path: filePath,
    query: `sid=${encodeURIComponent(sessionId)}&v=${version}`,
  });
}

/**
 * Recover `(sessionId, version, filePath)` from a checkpoint URI, or `null`
 * when the query is missing or malformed. Exported so the provider stays a
 * one-liner and the parsing is directly testable.
 */
export function parseCheckpointUri(
  uri: { path: string; query: string },
): { sessionId: string; filePath: string; version: number } | null {
  const params = new URLSearchParams(uri.query);
  const sessionId = params.get("sid") ?? "";
  const version = Number(params.get("v"));
  if (!isValidTarget(sessionId, uri.path, version)) return null;
  return { sessionId, filePath: uri.path, version };
}

/**
 * Content for a checkpoint URI. Returns an explanatory line rather than
 * throwing when the blob cannot be served: this runs inside the diff editor,
 * where an exception surfaces as an opaque "unable to resolve resource".
 */
export function provideCheckpointContent(uri: { path: string; query: string }): string {
  const target = parseCheckpointUri(uri);
  if (target === null) return UNAVAILABLE_NOTICE;
  const blob = readCheckpointBlob(
    target.sessionId,
    backupNameFor(target.filePath, target.version),
  );
  return blob === null ? UNAVAILABLE_NOTICE : blob.toString("utf-8");
}

/**
 * The provider registration, created on first use and kept for the life of
 * the extension host.
 *
 * Registered lazily rather than at activation because the checkpoint tab is
 * one of nine and most sessions never open it — `activate()` is on the
 * critical path for every window. The disposable is retained so a second call
 * cannot double-register (VS Code throws on a duplicate scheme).
 */
let providerRegistration: vscode.Disposable | null = null;

/** Register the checkpoint content provider if it is not already registered. */
export function ensureCheckpointProvider(): vscode.Disposable {
  if (providerRegistration) return providerRegistration;
  providerRegistration = vscode.workspace.registerTextDocumentContentProvider(
    CHECKPOINT_SCHEME,
    { provideTextDocumentContent: (uri) => provideCheckpointContent(uri) },
  );
  return providerRegistration;
}

/** Drop the registration. Called on deactivate and between tests. */
export function disposeCheckpointProvider(): void {
  providerRegistration?.dispose();
  providerRegistration = null;
}

/** True when the blob backing this version is present and readable. */
function blobExists(sessionId: string, filePath: string, version: number): boolean {
  const file = blobPath(sessionId, backupNameFor(filePath, version));
  if (file === null) return false;
  try {
    // lstat, not stat: a symlink planted in the history tree must not read as
    // an available checkpoint. `openFileNoFollow` refuses it at read time too.
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

/** The open text document for `filePath`, or undefined when it is not open. */
function openDocumentFor(filePath: string): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find(
    (doc) => doc.uri.scheme === "file" && doc.uri.fsPath === filePath,
  );
}

/**
 * Open a diff of one checkpoint version against the working file.
 *
 * When the working file is gone the diff has no right-hand side, so we open
 * the checkpoint on its own instead — "the file was deleted, here is what
 * Claude last saw" is the useful answer, not an error.
 *
 * @returns true when something was opened.
 */
export async function openCheckpointDiff(
  sessionId: string,
  filePath: string,
  version: number,
): Promise<boolean> {
  if (!isValidTarget(sessionId, filePath, version)) {
    vscode.window.showErrorMessage("That checkpoint could not be identified.");
    return false;
  }
  if (!blobExists(sessionId, filePath, version)) {
    vscode.window.showErrorMessage(
      `Version ${version} of ${path.basename(filePath)} is no longer on disk — Claude Code pruned it.`,
    );
    return false;
  }

  ensureCheckpointProvider();
  const left = checkpointUri(sessionId, filePath, version);

  if (!fs.existsSync(filePath)) {
    const doc = await vscode.workspace.openTextDocument(left);
    await vscode.window.showTextDocument(doc, { preview: true });
    return true;
  }

  await vscode.commands.executeCommand(
    "vscode.diff",
    left,
    vscode.Uri.file(filePath),
    `${path.basename(filePath)} — v${version} ↔ working file`,
  );
  return true;
}

/**
 * Write restored bytes over the working file.
 *
 * Two paths, for one reason: EOL. When the file is already open, it has a text
 * model that owns its end-of-line setting, and a `WorkspaceEdit` lands on the
 * user's own undo stack — Ctrl+Z reverses the restore, which is the whole
 * point of preferring an edit. When it is NOT open there is no undo stack to
 * join, and routing the bytes through a text model would normalise line
 * endings and the trailing newline; `workspace.fs.writeFile` puts the exact
 * bytes on disk and still fires the file-system events watchers depend on.
 */
async function writeRestored(filePath: string, bytes: Buffer): Promise<boolean> {
  const uri = vscode.Uri.file(filePath);
  const doc = openDocumentFor(filePath);

  if (doc) {
    const edit = new vscode.WorkspaceEdit();
    const lastLine = doc.lineAt(Math.max(doc.lineCount - 1, 0));
    edit.replace(
      uri,
      new vscode.Range(new vscode.Position(0, 0), lastLine.range.end),
      bytes.toString("utf-8"),
    );
    if (!(await vscode.workspace.applyEdit(edit))) return false;
    // Save so the restore is real on disk. The edit stays on the undo stack,
    // so Ctrl+Z still puts the previous contents back.
    return await doc.save();
  }

  await vscode.workspace.fs.writeFile(uri, new Uint8Array(bytes));
  return true;
}

/**
 * Restore one checkpoint version over the working file.
 *
 * **Destructive.** This overwrites the user's file, so it never runs without
 * an explicit modal confirmation that names the file, the version, and — when
 * the file has unsaved edits open — the fact that those edits are about to be
 * replaced.
 */
export async function restoreCheckpoint(
  sessionId: string,
  filePath: string,
  version: number,
): Promise<RestoreResult> {
  if (!isValidTarget(sessionId, filePath, version)) {
    vscode.window.showErrorMessage("That checkpoint could not be identified.");
    return { ok: false, reason: "unavailable" };
  }

  const bytes = readCheckpointBlob(sessionId, backupNameFor(filePath, version));
  if (bytes === null) {
    vscode.window.showErrorMessage(
      `Version ${version} of ${path.basename(filePath)} is no longer on disk — Claude Code pruned it.`,
    );
    return { ok: false, reason: "unavailable" };
  }

  const name = path.basename(filePath);
  const dirty = openDocumentFor(filePath)?.isDirty === true;
  const detail = [
    `${filePath} will be overwritten with the contents Claude Code recorded as version ${version}.`,
    dirty
      ? `${name} has unsaved changes in an open editor — those changes will be replaced.`
      : "",
    "You can undo this from the editor's Local History if the file is not open.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Modal: a restore is irreversible from the webview's point of view, and a
  // dismissible toast is not consent.
  const choice = await vscode.window.showWarningMessage(
    `Restore ${name} to version ${version}?`,
    { modal: true, detail },
    "Restore",
  );
  if (choice !== "Restore") return { ok: false, reason: "cancelled" };

  try {
    if (!(await writeRestored(filePath, bytes))) {
      vscode.window.showErrorMessage(`Could not write ${filePath}.`);
      return { ok: false, reason: "write-failed" };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Could not write ${filePath}: ${message}`);
    return { ok: false, reason: "write-failed" };
  }

  vscode.window.showInformationMessage(`Restored ${name} to version ${version}.`);
  return { ok: true };
}
