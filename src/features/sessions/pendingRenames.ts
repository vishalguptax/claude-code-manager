/**
 * Renames made in the sidebar that Claude Code has not applied yet.
 *
 * Claude Code has no way for another program to rename a session it is not
 * hosting. What it does offer is a hook output: a SessionStart or
 * UserPromptSubmit hook may return `sessionTitle`, and the CLI saves that as
 * a real rename — the same `custom-title` (and messaging `agent-name`) a
 * `/rename` writes. So a sidebar rename is parked here, and the rename hook
 * (sessionRenameTap) hands it over the next time the session starts or the
 * user sends it a prompt, then removes it.
 *
 * Shared by the extension host and the hook script: plain Node, no vscode.
 */
import * as fs from "fs";
import * as path from "path";
import { PENDING_RENAMES_DIR } from "../../core/config";
import { writeFileAtomic } from "../../core/atomicWrite";

const SUFFIX = ".json";

/**
 * Session ids become file names, so anything but an id's own characters is
 * refused — a crafted id must not be able to reach outside the directory.
 */
const SESSION_ID = /^[0-9A-Za-z-]{1,64}$/;

function fileFor(sessionId: string): string | null {
  return SESSION_ID.test(sessionId) ? path.join(PENDING_RENAMES_DIR, sessionId + SUFFIX) : null;
}

/** The title in a pending file's JSON, or null for anything malformed. */
function parseTitle(raw: string): string | null {
  try {
    const data: unknown = JSON.parse(raw);
    const title = (data as { title?: unknown } | null)?.title;
    return typeof title === "string" && title.trim() ? title.trim() : null;
  } catch {
    return null;
  }
}

/** Park a rename for Claude Code to apply. Throws when it cannot be saved. */
export function setPendingRename(sessionId: string, title: string): void {
  const file = fileFor(sessionId);
  if (!file) throw new Error(`invalid session id: ${sessionId}`);
  fs.mkdirSync(PENDING_RENAMES_DIR, { recursive: true });
  writeFileAtomic(file, JSON.stringify({ title: title.trim() }));
}

/** Drop a session's pending rename, if it has one. */
export function clearPendingRename(sessionId: string): void {
  const file = fileFor(sessionId);
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    // Already applied by the hook, or never set — nothing to drop.
  }
}

/** Every pending rename, by session id. Empty when none or unreadable. */
export function readPendingRenames(): Record<string, string> {
  const out: Record<string, string> = {};
  let names: string[];
  try {
    names = fs.readdirSync(PENDING_RENAMES_DIR);
  } catch {
    return out;
  }
  for (const name of names) {
    // Skips writeFileAtomic's temp files and the hook's claimed files.
    if (!name.endsWith(SUFFIX)) continue;
    const sessionId = name.slice(0, -SUFFIX.length);
    if (!SESSION_ID.test(sessionId)) continue;
    try {
      const title = parseTitle(fs.readFileSync(path.join(PENDING_RENAMES_DIR, name), "utf-8"));
      if (title) out[sessionId] = title;
    } catch {
      // Claimed by the hook between the listing and the read.
    }
  }
  return out;
}

/**
 * Take a session's pending rename for the hook to hand over: the file is
 * first moved aside under a name only this process uses, then read and
 * deleted. Moving first makes the claim atomic — a rename the extension
 * saves meanwhile lands in a fresh file and waits for the next claim instead
 * of being deleted unseen.
 */
export function claimPendingRename(sessionId: string): string | null {
  const file = fileFor(sessionId);
  if (!file) return null;
  const claimed = `${file}.${process.pid}.claimed`;
  try {
    fs.renameSync(file, claimed);
  } catch {
    return null;
  }
  try {
    return parseTitle(fs.readFileSync(claimed, "utf-8"));
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(claimed);
    } catch {
      // Nothing left to clean up.
    }
  }
}
