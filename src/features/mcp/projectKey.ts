/**
 * The key Claude Code files a workspace under in ~/.claude.json's `projects`
 * map — where `claude mcp add` (default `--scope local`) stores servers and
 * where `/mcp` records `disabledMcpServers`. Pure Node.js, no VS Code.
 *
 * Reading or writing any other spelling of the path would show servers the CLI
 * never loads, or create a second entry the CLI never reads. So this mirrors
 * the CLI's own derivation (2.1.x), step for step:
 *   1. cwd → `realpathSync`, NFC-normalised (its startup "original cwd");
 *   2. walk up to the nearest directory holding a `.git` (file or dir);
 *   3. a linked worktree maps to its main checkout, so every worktree of one
 *      repo shares one entry;
 *   4. outside any repo the realpath itself is the key;
 *   5. on Windows, backslashes become forward slashes.
 */
import * as fs from "fs";
import * as path from "path";

/** `fs.readFileSync` as trimmed text, or null when it cannot be read. */
function readTrimmed(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return null;
  }
}

/** True when `p` exists as a file or directory (symlinks followed). */
function exists(p: string): boolean {
  try {
    const st = fs.statSync(p);
    return st.isFile() || st.isDirectory();
  } catch {
    return false;
  }
}

/** Nearest ancestor of `dir` (inclusive) holding a `.git`, or null. */
function findGitRoot(dir: string): string | null {
  for (let head = dir; ; head = path.dirname(head)) {
    if (exists(path.join(head, ".git"))) return head;
    if (path.dirname(head) === head) return null;
  }
}

/**
 * The main checkout of the repository `root` belongs to. A linked worktree's
 * `.git` is a file (`gitdir: <common>/worktrees/<name>`); the CLI follows it
 * only when the worktree's admin dir checks out — a `commondir` pointing back
 * at the common dir, an admin dir that sits in `<common>/worktrees`, and a
 * `gitdir` back-link naming this checkout. Anything else keys by `root`
 * itself. A bare common dir (not named `.git`) is the key on its own.
 */
function canonicalRepoRoot(root: string): string {
  const dotGit = readTrimmed(path.join(root, ".git"));
  if (dotGit === null || !dotGit.startsWith("gitdir:")) return root;
  const adminDir = path.resolve(root, dotGit.slice("gitdir:".length).trim());
  const commonRel = readTrimmed(path.join(adminDir, "commondir"));
  if (commonRel === null) return root;
  const commonDir = path.resolve(adminDir, commonRel);
  if (path.dirname(adminDir) !== path.join(commonDir, "worktrees")) return root;
  const backLink = readTrimmed(path.join(adminDir, "gitdir"));
  if (backLink === null || path.resolve(adminDir, backLink) !== path.join(root, ".git")) return root;
  if (path.basename(commonDir) !== ".git") {
    return exists(path.join(commonDir, ".git")) ? root : commonDir;
  }
  return path.dirname(commonDir);
}

/**
 * The cwd a Claude Code session started in `workspacePath` sees: realpath'd
 * and NFC-normalised, as the CLI fixes it at startup.
 */
export function claudeCwd(workspacePath: string): string {
  let cwd = path.resolve(workspacePath);
  try {
    cwd = fs.realpathSync(cwd);
  } catch {
    // Missing folder: the CLI falls back to the unresolved cwd too.
  }
  return cwd.normalize("NFC");
}

/** The `projects` key Claude Code uses for a session started in `workspacePath`. */
export function claudeProjectKey(workspacePath: string): string {
  const cwd = claudeCwd(workspacePath);
  const gitRoot = findGitRoot(cwd);
  const key = gitRoot === null ? cwd : canonicalRepoRoot(gitRoot).normalize("NFC");
  return process.platform === "win32" ? key.replace(/\\/g, "/") : key;
}
