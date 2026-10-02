/**
 * Safe read-modify-write for config files Claude Code also owns
 * (settings.json, ~/.claude.json, .mcp.json).
 *
 * Write half — `writeFileAtomic`: write to a sibling temp file, then rename
 * it over the target. `rename` is atomic on the same filesystem, so a crash
 * or power loss can never leave the target half-written — a reader sees
 * either the old file or the new one, never a truncated mix.
 *
 * Read half — `readJsonObjectForWrite`: decides whether a file is safe to
 * rewrite at all. Without it, an atomic write still replaces a file we
 * misread with a fresh one holding only our key.
 */
import * as fs from "fs";
import * as path from "path";

/**
 * The path a write should land on. A dotfile manager (stow, chezmoi,
 * yadm) commonly makes ~/.claude/settings.json a symlink into its repo;
 * renaming a temp file onto the LINK replaces the link with a plain file,
 * silently detaching the user's settings from their dotfiles. Writing
 * next to the real file and renaming onto it keeps the link intact.
 * A path that does not exist yet is written as-is. A dangling link (its
 * target not checked out yet) is followed one hop to where it points, so
 * the write creates that file rather than detaching the link.
 */
function realTarget(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    // fall through: absent, or a link whose target is missing
  }
  try {
    if (fs.lstatSync(filePath).isSymbolicLink()) {
      return path.resolve(path.dirname(filePath), fs.readlinkSync(filePath));
    }
  } catch {
    // absent — write as-is
  }
  return filePath;
}

/** Permission bits of an existing file, or null when there is none. */
function existingMode(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mode & 0o777;
  } catch {
    return null;
  }
}

/**
 * Throws on failure (and removes the temp file); callers that want a
 * boolean wrap it in try/catch.
 */
export function writeFileAtomic(filePath: string, data: string | Uint8Array): void {
  const target = realTarget(filePath);
  // The original's mode is carried over: a user who chmod 600'd a file
  // holding env secrets must not get it back world-readable because the
  // temp file was created under the default umask.
  const mode = existingMode(target);
  // The pid keeps two VS Code windows (separate extension hosts) writing
  // the same file at once from truncating each other's temp file.
  const tmp = `${target}.${process.pid}.csm-tmp`;
  try {
    fs.writeFileSync(tmp, data);
    if (mode !== null) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // temp file may not exist — nothing to clean up
    }
    throw err;
  }
}

/** A write's result: done, or the user-facing reason it was not. */
export type WriteOutcome = { ok: true } | { ok: false; error: string };

/** True for a JSON object — not null, not an array. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * How long an empty file must sit unmodified before it counts as genuinely
 * empty. Claude Code rewrites settings.json and ~/.claude.json in place
 * (truncate, then write), so a reader can catch a zero-byte file whose mtime
 * is the truncation instant; the rewrite lands within milliseconds. A file
 * still empty two seconds after its last modification is not mid-write — it
 * was `touch`ed, or an editor saved it blank — and refusing it forever would
 * leave every writer stuck on a "try again" that never works.
 */
const EMPTY_FILE_SETTLE_MS = 2_000;

/** Why a file must not be rewritten. */
export type ReadRefusalReason =
  /** Empty and modified within EMPTY_FILE_SETTLE_MS: being rewritten now. */
  | "mid-write"
  /** Present, but the read failed (EACCES, EPERM, EBUSY, EISDIR, …). */
  | "unreadable"
  /** Has content that does not parse as JSON. */
  | "invalid-json"
  /** Parses, but to an array, a string, a number or null. */
  | "not-object";

type JsonReadForWrite =
  | {
      ok: true;
      data: Record<string, unknown>;
      /** The file's text; null when it does not exist. */
      raw: string | null;
    }
  /** `detail`: the read error, for an unreadable file. */
  | { ok: false; reason: ReadRefusalReason; detail?: string };

/**
 * Read a JSON file as the object a read-modify-write pass may edit — the one
 * rule every writer of a file Claude Code also owns goes through.
 *
 * Safe to edit (`ok: true`):
 * - **Absent (ENOENT)** → `{}`. Nothing to lose, so creating it is safe.
 * - **Empty or whitespace, unmodified for EMPTY_FILE_SETTLE_MS** → `{}`.
 * - **A JSON object** → that object.
 *
 * Refused (`ok: false`) — the caller must not write:
 * - **mid-write**: empty and freshly modified. A VS Code window activating
 *   while Claude Code rewrites settings.json reads exactly this; treating it
 *   as absent made selfHealStatusline / syncSessionTap write a file holding
 *   only our key, wiping permissions, env, hooks, enabledPlugins and MCP
 *   approvals.
 * - **unreadable**: any read error but ENOENT. The file is there; we just
 *   could not see it. Overwriting it turns a transient error into data loss.
 * - **invalid-json / not-object**: Claude Code skips such a file too, so the
 *   user is likely mid-repair; we cannot merge into it.
 */
export function readJsonObjectForWrite(filePath: string): JsonReadForWrite {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, data: {}, raw: null };
    return { ok: false, reason: "unreadable", detail: (err as Error).message };
  }
  if (raw.trim() === "") return emptyFileVerdict(filePath, raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  return isPlainObject(parsed) ? { ok: true, data: parsed, raw } : { ok: false, reason: "not-object" };
}

/**
 * Settled-or-rewriting verdict for a file just read as empty. The distance
 * is absolute so a clock-skewed mtime far in the future (a network share)
 * cannot pin the file as "being written" forever. A file that vanished
 * between the read and the stat is mid-rename — a rewrite in progress.
 */
function emptyFileVerdict(filePath: string, raw: string): JsonReadForWrite {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT"
      ? { ok: false, reason: "mid-write" }
      : { ok: false, reason: "unreadable", detail: (err as Error).message };
  }
  return Math.abs(Date.now() - mtimeMs) < EMPTY_FILE_SETTLE_MS
    ? { ok: false, reason: "mid-write" }
    : { ok: true, data: {}, raw };
}

/**
 * The user-facing reason a refused file was left alone, naming the file.
 * One wording per reason, so every writer tells the user the same thing
 * about the same file state. No trailing period: callers embed it in their
 * own sentence or append one.
 */
export function describeReadRefusal(
  filePath: string,
  refusal: { reason: ReadRefusalReason; detail?: string },
): string {
  switch (refusal.reason) {
    case "mid-write":
      return `${filePath} is being written by Claude Code right now, so it was left untouched. Try again in a moment`;
    case "unreadable":
      return `${filePath} couldn't be read (${refusal.detail ?? "unknown error"}), so it was left untouched`;
    case "invalid-json":
      return `${filePath} isn't valid JSON, so it was left untouched. Fix or remove it, then try again`;
    case "not-object":
      return `${filePath} doesn't hold a JSON object, so it was left untouched. Fix or remove it, then try again`;
  }
}
