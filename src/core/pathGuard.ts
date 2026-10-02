/**
 * Containment checks for paths that arrive from the webview.
 *
 * The webview is a browser context the host must not trust: a message that
 * names a path to delete or rewrite is resolved against what the host itself
 * parsed AND checked to sit inside the root it belongs to. Containment is
 * decided on canonical paths (symlinks resolved, case folded where the
 * filesystem is case-insensitive) so neither `..` segments nor a symlinked
 * parent can walk a path out of its root.
 *
 * Pure Node.js — no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import { canonicalPath } from "./config";

/** The case folding `canonicalPath` applies, for a segment it did not resolve. */
function fold(segment: string): string {
  return process.platform === "win32" || process.platform === "darwin"
    ? segment.toLowerCase()
    : segment;
}

/**
 * Whether `candidate` lies strictly below `root`. Every directory above the
 * candidate is resolved through symlinks; the candidate itself is not, so a
 * symlinked entry inside the root counts as inside (acting on it acts on
 * the link — see {@link removeEntry}) while a symlinked parent that points
 * elsewhere does not.
 */
export function isStrictlyInside(candidate: string, root: string): boolean {
  const abs = path.resolve(candidate);
  const resolved = path.join(canonicalPath(path.dirname(abs)), fold(path.basename(abs)));
  const base = canonicalPath(root);
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  return resolved.startsWith(prefix) && resolved.length > prefix.length;
}

/**
 * Delete a file or directory entry without following a symlink: a link is
 * unlinked (its target is left alone), a directory is removed recursively
 * (Node's recursive rm does not descend through links either).
 */
export function removeEntry(target: string): void {
  if (fs.lstatSync(target).isSymbolicLink()) fs.unlinkSync(target);
  else fs.rmSync(target, { recursive: true, force: true });
}

/** Two spellings of one path compare equal (resolved, case folded, links kept). */
export function samePath(a: string, b: string): boolean {
  return fold(path.resolve(a)) === fold(path.resolve(b));
}
