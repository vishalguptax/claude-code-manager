/**
 * Symlink-safe read handle for untrusted files.
 *
 * Session transcripts live under ~/.claude/projects/, a tree this extension
 * does not own: the CLI, sync tools, and any repo-scoped tooling write there.
 * A symlink planted in that tree makes a plain `fs.openSync(path, "r")` read
 * whatever the link points at — an SSH key, a .env — and we would surface the
 * bytes in the webview. Every transcript read therefore goes through
 * {@link openFileNoFollow}.
 *
 * This mirrors the guard the Claude Code CLI applies to the same files
 * (v2.1.273): `O_RDONLY | O_NOFOLLOW` off-Windows, and an `lstat().isFile()`
 * pre-check on win32 where `O_NOFOLLOW` does not exist.
 *
 * Pure Node.js — no VS Code dependency.
 */
import * as fs from "fs";

/**
 * Open flags for reading an untrusted file on `platform`.
 *
 * `O_NOFOLLOW` makes the kernel fail the open with ELOOP when the final path
 * component is a symlink — race-free, unlike any stat-then-open check. Windows
 * has no such flag, so there the value degrades to bare `O_RDONLY` and
 * {@link openFileNoFollow} switches to its lstat pre-check instead. Exported
 * as a function so tests can exercise the win32 branch without mutating the
 * global `process.platform`.
 */
export function computeReadFlags(platform: NodeJS.Platform): number {
  return platform === "win32"
    ? fs.constants.O_RDONLY
    : fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
}

/** Open flags for untrusted reads on the running platform. */
export const READ_NOFOLLOW_FLAGS: number = computeReadFlags(process.platform);

/**
 * Open `filePath` read-only, refusing symlinks and anything that is not a
 * regular file. Returns the file descriptor, or `null` when the file cannot
 * be opened safely — missing, a symlink, a directory, out of descriptors
 * (EMFILE), permission denied. Callers own the descriptor and must close it.
 *
 * Never throws: every caller sits behind the postMessage boundary where a
 * rejected file has to degrade to "unreadable", not crash the extension host.
 *
 * `flags` exists as a test seam for the win32 path; production callers take
 * the default.
 */
export function openFileNoFollow(
  filePath: string,
  flags: number = READ_NOFOLLOW_FLAGS,
): number | null {
  // Windows fallback: without O_NOFOLLOW the open would follow a symlink, so
  // check first. `lstat` describes the link itself, so `isFile()` is false for
  // a symlink and the file is refused. Inherently racy — a link swapped in
  // between the lstat and the open still wins — but it is the only check the
  // platform offers, and it is what the CLI does.
  if (flags === fs.constants.O_RDONLY) {
    try {
      if (!fs.lstatSync(filePath).isFile()) return null;
    } catch {
      return null;
    }
  }

  let fd: number;
  try {
    fd = fs.openSync(filePath, flags);
  } catch {
    return null;
  }

  // O_NOFOLLOW only rejects symlinks; opening a directory or a FIFO still
  // succeeds and would fail later at the read with a confusing EISDIR, or
  // block forever on a FIFO. Checking the descriptor (not the path) is
  // race-free: it describes the object we actually hold.
  try {
    if (!fs.fstatSync(fd).isFile()) {
      fs.closeSync(fd);
      return null;
    }
  } catch {
    fs.closeSync(fd);
    return null;
  }

  return fd;
}
