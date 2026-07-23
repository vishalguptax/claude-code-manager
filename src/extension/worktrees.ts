/**
 * Git worktree detection for sessions — extension host only (uses child_process).
 *
 * A Claude Code session records its working directory as `Session.projectPath`.
 * When the session ran inside a git worktree, that path is the worktree's
 * checkout, not the repository's main checkout. This module resolves, for a
 * given directory:
 *   - which worktree it belongs to and that worktree's branch,
 *   - the shared repo root (the main worktree path) so sessions across every
 *     worktree of one repo can be grouped under a single repo entry instead of
 *     fragmenting into N separate "projects",
 *   - whether the worktree was created by Claude Code or by the user, and
 *   - whether git currently holds a lock on it (Claude locks a worktree while a
 *     session is actively running inside it).
 *
 * Security: every git invocation uses execFileSync with an argument array and
 * no shell. The directory is passed via the `cwd` option, never interpolated
 * into a command string, so a path containing shell metacharacters cannot
 * inject a command.
 */
import { execFileSync } from "child_process";
import { normPath } from "../core/utils";

/** Who created a worktree. `main` is the repository's primary checkout. */
export type WorktreeKind = "main" | "claude" | "user";

/** Resolved worktree metadata for a session's recorded directory. */
export interface WorktreeRef {
  /** Absolute path of the worktree the directory resolves to. */
  path: string;
  /** Branch checked out in the worktree; "" when detached HEAD. */
  branch: string;
  /** Origin of the worktree: repo main checkout, Claude Code, or the user. */
  kind: WorktreeKind;
  /** True while the worktree directory still exists on disk. */
  exists: boolean;
  /**
   * True while git holds a lock on the worktree. Claude Code runs
   * `git worktree lock` on a worktree with a live session, so a lock is a
   * strong hint the worktree is in active use.
   */
  locked: boolean;
  /**
   * Path shared by every worktree of the same repository — the main
   * worktree's checkout path. Sessions are grouped by this so worktrees of a
   * single repo collapse under one repo entry.
   */
  repoRoot: string;
}

/** One entry parsed from `git worktree list --porcelain`. */
interface RawWorktree {
  path: string;
  branch: string;
  locked: boolean;
  detached: boolean;
  bare: boolean;
}

/**
 * Run a git subcommand in `cwd`, returning stdout or null on any failure
 * (not a repo, git absent, timeout, non-zero exit). stderr is discarded — a
 * missing repo is an expected, non-exceptional outcome here.
 */
function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

/**
 * Parse the output of `git worktree list --porcelain` into raw entries.
 * The porcelain format lists one attribute per line, entries separated by a
 * blank line; the main worktree is always listed first. `branch` lines carry
 * a `refs/heads/<name>` ref which we strip to the short name.
 *
 * Exported for direct unit testing against captured fixtures.
 */
export function parseWorktreePorcelain(out: string): RawWorktree[] {
  const list: RawWorktree[] = [];
  let cur: Partial<RawWorktree> | null = null;

  const flush = (): void => {
    if (cur?.path) {
      list.push({
        path: cur.path,
        branch: cur.branch ?? "",
        locked: cur.locked ?? false,
        detached: cur.detached ?? false,
        bare: cur.bare ?? false,
      });
    }
    cur = null;
  };

  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      cur = { path: line.slice("worktree ".length).trim() };
    } else if (!cur) {
      continue;
    } else if (line.startsWith("branch ")) {
      cur.branch = line
        .slice("branch ".length)
        .trim()
        .replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      cur.detached = true;
    } else if (line === "bare") {
      cur.bare = true;
    } else if (line === "locked" || line.startsWith("locked ")) {
      // Porcelain emits a bare "locked" or "locked <reason>".
      cur.locked = true;
    }
  }
  flush();
  return list;
}

/**
 * Classify a worktree as main / Claude-created / user-created.
 *
 * Claude Code places worktrees it creates under `.claude/worktrees/<name>/`
 * on branches named `worktree-<name>` (or `pr-<number>` for PR worktrees).
 * A user can relocate Claude's worktrees with a `WorktreeCreate` hook, so the
 * branch-name prefix is a fallback signal when the path check misses. Anything
 * that is neither the main checkout nor Claude-shaped is treated as
 * user-created.
 */
export function classifyWorktree(
  wtPath: string,
  branch: string,
  isMain: boolean,
): WorktreeKind {
  if (isMain) return "main";
  if (normPath(wtPath).includes("/.claude/worktrees/")) return "claude";
  if (/^worktree-/.test(branch) || /^pr-\d+$/.test(branch)) return "claude";
  return "user";
}

/**
 * Module-level cache of parsed worktree lists, keyed by the git common dir so
 * every worktree of one repo shares a single `git worktree list` spawn within
 * a resolve batch. Cleared by {@link clearWorktreeCache} on reload/resume so a
 * newly created or pruned worktree is re-detected.
 */
const listCache = new Map<string, RawWorktree[]>();

/** Drop the cached worktree lists so the next resolve re-runs git. */
export function clearWorktreeCache(): void {
  listCache.clear();
}

/**
 * Resolve the worktree a directory belongs to, or null when the directory is
 * not inside a git repository (or no longer exists on disk).
 *
 * Steps: find the directory's own top-level (`rev-parse --show-toplevel`) and
 * its shared common dir (`--git-common-dir`), list every worktree of the repo
 * (cached by common dir), then match the top-level against the list to recover
 * that worktree's branch, lock state, and main-worktree root.
 */
export function resolveWorktree(dir: string): WorktreeRef | null {
  const toplevel = git(dir, ["rev-parse", "--path-format=absolute", "--show-toplevel"]);
  if (!toplevel) return null;
  const topNorm = normPath(toplevel.trim());

  const commonDir = git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const cacheKey = commonDir ? normPath(commonDir.trim()) : topNorm;

  let raw = listCache.get(cacheKey);
  if (!raw) {
    const out = git(dir, ["worktree", "list", "--porcelain"]);
    if (out === null) return null;
    raw = parseWorktreePorcelain(out);
    listCache.set(cacheKey, raw);
  }
  if (raw.length === 0) return null;

  // git lists the main worktree first; it is the shared root for the repo.
  const main = raw[0];
  const match = raw.find((w) => normPath(w.path) === topNorm) ?? main;
  const isMain = normPath(match.path) === normPath(main.path);

  return {
    path: match.path,
    branch: match.branch,
    kind: classifyWorktree(match.path, match.branch, isMain),
    exists: true,
    locked: match.locked,
    repoRoot: main.path,
  };
}

/**
 * Find an existing worktree of the repository containing `dir` that currently
 * has `branch` checked out, or null when no such worktree exists (or `dir` is
 * not in a repo).
 *
 * Used by resume: git refuses `git checkout <branch>` when that branch is
 * already checked out in another worktree, so an in-place switch would fail.
 * When the session's branch lives in a sibling worktree we redirect the resume
 * there instead of attempting the doomed checkout. Shares the {@link listCache}
 * with {@link resolveWorktree}, so it costs no extra `git worktree list` spawn
 * within a resolve batch.
 */
export function findWorktreeForBranch(dir: string, branch: string): WorktreeRef | null {
  if (!branch) return null;

  const commonDir = git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!commonDir) return null;
  const cacheKey = normPath(commonDir.trim());

  let raw = listCache.get(cacheKey);
  if (!raw) {
    const out = git(dir, ["worktree", "list", "--porcelain"]);
    if (out === null) return null;
    raw = parseWorktreePorcelain(out);
    listCache.set(cacheKey, raw);
  }
  if (raw.length === 0) return null;

  const main = raw[0];
  const match = raw.find((w) => w.branch === branch);
  if (!match) return null;
  const isMain = normPath(match.path) === normPath(main.path);

  return {
    path: match.path,
    branch: match.branch,
    kind: classifyWorktree(match.path, match.branch, isMain),
    exists: true,
    locked: match.locked,
    repoRoot: main.path,
  };
}

/** Path fragment marking a Claude Code-created worktree checkout. */
const CLAUDE_WT_MARKER = "/.claude/worktrees/";

/**
 * Synthesize a WorktreeRef for a Claude-created worktree whose directory no
 * longer exists on disk (Claude cleaned it up, or the user pruned it). Live
 * detection via {@link resolveWorktree} can only see worktrees that still
 * exist — git fails on a missing directory — so a removed worktree would
 * otherwise vanish from the UI with no way to recreate it.
 *
 * Only claims the directory when it matches Claude's `.claude/worktrees/<name>`
 * convention AND the repo root derived from it (the segment before the marker)
 * is a real git repository. That guard stops us inventing a worktree for an
 * arbitrary deleted path. `branch` is carried from the session so the recreate
 * flow (`git worktree add <path> <branch>`) knows which branch to restore.
 *
 * Returns a ref with `exists: false`; null when the path is not a Claude
 * worktree or the derived repo root is not a git repo.
 */
export function resolveMissingClaudeWorktree(dir: string, branch: string): WorktreeRef | null {
  if (!dir) return null;
  // Forward-slash form preserves length + case, so the lowercase marker index
  // is a valid slice point into the original-case string.
  const fwd = dir.replace(/\\/g, "/");
  const idx = fwd.toLowerCase().indexOf(CLAUDE_WT_MARKER);
  if (idx <= 0) return null;
  const repoRoot = fwd.slice(0, idx);
  const top = git(repoRoot, ["rev-parse", "--path-format=absolute", "--show-toplevel"]);
  if (!top) return null;

  return {
    path: dir,
    branch,
    kind: "claude",
    exists: false,
    locked: false,
    repoRoot,
  };
}

/**
 * Resolve worktrees for many directories at once, returning a map keyed by the
 * exact input directory string. Directories that are not in a repo are omitted
 * from the result (callers fall back to treating the directory as its own
 * group). The shared {@link listCache} means repos with many sessions across
 * worktrees still spawn `git worktree list` only once per repo.
 *
 * Deduplicates by normalized path so N sessions in the same directory cost one
 * resolve, then fans the result back out to every original key.
 */
export function resolveWorktrees(dirs: string[]): Map<string, WorktreeRef> {
  const out = new Map<string, WorktreeRef>();
  const byNorm = new Map<string, WorktreeRef | null>();

  for (const dir of dirs) {
    if (!dir) continue;
    const key = normPath(dir);
    let ref = byNorm.get(key);
    if (ref === undefined) {
      ref = resolveWorktree(dir);
      byNorm.set(key, ref);
    }
    if (ref) out.set(dir, ref);
  }
  return out;
}
