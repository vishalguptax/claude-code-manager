/**
 * Pure, repo-aware grouping helpers for git worktrees. No JSX, no signal reads —
 * every function takes its inputs (the session list, the worktree map keyed by
 * session id, the workspace path) explicitly so it stays trivially unit-testable
 * and the model segment can wrap it in thin signal-reading selectors.
 *
 * The core idea: a session that ran inside a worktree carries a `WorktreeRef`.
 * Its *project-filter identity* is then the shared `repoRoot` rather than the
 * checkout directory name, so every worktree of one repo collapses under a
 * single project entry instead of fragmenting into N look-alike "projects".
 * Sessions with no ref keep grouping by their project name exactly as before.
 */
import type { Session, WorktreeRef } from "../../types";

/** Worktree-kind filter selection. "all" applies no narrowing. */
export type WorktreeFilter = "all" | "main" | "claude" | "user";

/** Map of session id → resolved worktree metadata. */
export type WorktreeMap = Record<string, WorktreeRef>;

/** Basename of an absolute path, tolerant of trailing slashes and either separator. */
export function pathTail(p: string): string {
  return (
    p
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .filter(Boolean)
      .pop() ?? ""
  );
}

/** Strip a trailing separator so two spellings of the same directory compare equal. */
function normDir(p: string): string {
  return p.replace(/[/\\]+$/, "");
}

/**
 * The `repoRoot` of the worktree whose checkout path matches `workspacePath`,
 * or null when the workspace is not a resolved worktree. Lets "This Project"
 * expand to every sibling worktree of the repo the workspace lives in.
 */
export function currentRepoRoot(worktrees: WorktreeMap, workspacePath: string): string | null {
  if (!workspacePath) return null;
  const target = normDir(workspacePath);
  for (const ref of Object.values(worktrees)) {
    if (normDir(ref.path) === target) return ref.repoRoot;
  }
  return null;
}

/** True when `s` belongs to the repo rooted at `repoRoot` (via its worktree ref). */
export function isSameRepo(s: Session, worktrees: WorktreeMap, repoRoot: string | null): boolean {
  if (!repoRoot) return false;
  const ref = worktrees[s.id];
  return ref !== undefined && ref.repoRoot === repoRoot;
}

/**
 * The project-filter value a session groups under: its `repoRoot` when the
 * session ran in a worktree, else the plain project name (today's behaviour).
 */
export function projectGroupValue(s: Session, worktrees: WorktreeMap): string {
  const ref = worktrees[s.id];
  return ref ? ref.repoRoot : s.project;
}

/** True when the session passes the worktree-kind filter. */
export function matchesWorktreeFilter(
  s: Session,
  worktrees: WorktreeMap,
  filter: WorktreeFilter,
): boolean {
  if (filter === "all") return true;
  return worktrees[s.id]?.kind === filter;
}

/**
 * Whether any non-deleted session ran in a Claude- or user-created worktree.
 * Gates the worktree filter's visibility — with no such sessions the control
 * would offer nothing meaningful (mirrors the branch dropdown hiding rule).
 */
export function hasWorktrees(
  sessions: Session[],
  deleted: Set<string>,
  worktrees: WorktreeMap,
): boolean {
  return sessions.some((s) => {
    if (deleted.has(s.id)) return false;
    const kind = worktrees[s.id]?.kind;
    return kind === "claude" || kind === "user";
  });
}

/** One worktree-kind filter option with a per-kind session count. */
export interface WorktreeOption {
  value: WorktreeFilter;
  label: string;
  count: number;
}

/**
 * Worktree-kind filter options with per-kind counts. Leads with "All", then
 * only the kinds actually present (main / Claude / user) so the dropdown never
 * offers an empty bucket. Single O(N) pass over the non-deleted sessions.
 */
export function buildWorktreeOptions(
  sessions: Session[],
  deleted: Set<string>,
  worktrees: WorktreeMap,
): WorktreeOption[] {
  let total = 0;
  const counts: Record<"main" | "claude" | "user", number> = { main: 0, claude: 0, user: 0 };
  for (const s of sessions) {
    if (deleted.has(s.id)) continue;
    total++;
    const kind = worktrees[s.id]?.kind;
    if (kind) counts[kind]++;
  }
  const opts: WorktreeOption[] = [{ value: "all", label: "All checkouts", count: total }];
  if (counts.main) opts.push({ value: "main", label: "Main checkout", count: counts.main });
  if (counts.claude) opts.push({ value: "claude", label: "Claude worktrees", count: counts.claude });
  if (counts.user) opts.push({ value: "user", label: "User worktrees", count: counts.user });
  return opts;
}
