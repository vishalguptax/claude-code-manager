/**
 * Pure project / branch option builders for the sessions filter dropdowns.
 *
 * These take every input explicitly (the raw session list, the deleted-id set,
 * the current project / branch, the active project filter) so they hold no
 * dependency on the reactive signal layer and stay trivially unit-testable. The
 * model segment wraps them in thin selectors that read the live signal values.
 */
import type { Session } from "../../types";
import { pathTail, type WorktreeMap } from "./worktrees";

/**
 * All project names, current project first, then by most recent activity.
 * Used to populate the project filter dropdown.
 */
export function orderProjects(
  sessions: Session[],
  deleted: Set<string>,
  currentProject: string,
): string[] {
  const latestActivity = new Map<string, number>();
  const keyByProject = new Map<string, string>();
  for (const s of sessions) {
    if (!keyByProject.has(s.project)) keyByProject.set(s.project, s.projectKey);
    if (deleted.has(s.id)) continue;
    const prev = latestActivity.get(s.project) || 0;
    if (s.endTime > prev) latestActivity.set(s.project, s.endTime);
  }

  return [...latestActivity.keys()].sort((a, b) => {
    if (keyByProject.get(a) === currentProject) return -1;
    if (keyByProject.get(b) === currentProject) return 1;
    return (latestActivity.get(b) || 0) - (latestActivity.get(a) || 0);
  });
}

/**
 * Distinct branch names present in the (deletion-filtered) session list,
 * sorted alphabetically with the "(no branch)" sentinel last.
 */
export function listBranches(sessions: Session[], deleted: Set<string>): string[] {
  const set = new Set<string>();
  for (const s of sessions) {
    if (deleted.has(s.id)) continue;
    set.add(s.branch || "(no branch)");
  }
  return [...set].sort((a, b) => {
    if (a === "(no branch)") return 1;
    if (b === "(no branch)") return -1;
    return a.localeCompare(b);
  });
}

/** One option for the project filter dropdown: a value, its session count. */
export interface ProjectOption {
  value: string;
  label: string;
  count: number;
  /** True for the workspace project — annotated + pinned to top. */
  isCurrent: boolean;
}

/**
 * Project-filter options with per-project session counts — restores the v1
 * count badges. Leads with "This Project" (count of current-scope sessions)
 * and "All Projects" (total non-deleted), then every project by recency.
 * Single O(N) pass over sessions, mirroring v1 `updateDropdown`.
 *
 * Worktree-aware: a session that ran in a worktree groups under its shared
 * `repoRoot` (option value = repoRoot, label = repo basename) so every worktree
 * of one repo collapses into a single entry instead of fragmenting into N
 * look-alike checkout-dir "projects". Sessions with no ref keep grouping by
 * their project name — with an empty `worktrees` map this is byte-for-byte the
 * pre-worktree behaviour. When the workspace itself is a worktree, pass its
 * `repoRoot` so "This Project" counts the whole repo (matches getFiltered).
 */
export function buildProjectOptions(
  sessions: Session[],
  deleted: Set<string>,
  currentProject: string,
  worktrees: WorktreeMap = {},
  repoRoot: string | null = null,
): ProjectOption[] {
  const counts = new Map<string, number>();
  const labelByValue = new Map<string, string>();
  const keyByValue = new Map<string, string>();
  const latest = new Map<string, number>();
  const isRepoValue = new Set<string>();
  let currentCount = 0;
  let totalCount = 0;
  for (const s of sessions) {
    if (deleted.has(s.id)) continue;
    totalCount++;
    const ref = worktrees[s.id];
    // Worktree sessions collapse under repoRoot; others keep their project name.
    const value = ref ? ref.repoRoot : s.project;
    if (ref) isRepoValue.add(value);
    counts.set(value, (counts.get(value) ?? 0) + 1);
    if (!labelByValue.has(value)) labelByValue.set(value, ref ? pathTail(ref.repoRoot) : s.project);
    if (!keyByValue.has(value)) keyByValue.set(value, ref ? "" : s.projectKey);
    if (s.endTime > (latest.get(value) ?? 0)) latest.set(value, s.endTime);
    // "This Project" counts the current scope: the whole repo when the
    // workspace is a worktree, else the workspace project (verbatim old rule).
    const inCurrent = repoRoot
      ? ref?.repoRoot === repoRoot
      : Boolean(currentProject) && s.projectKey === currentProject;
    if (inCurrent) currentCount++;
  }

  const isCurrentValue = (value: string): boolean =>
    isRepoValue.has(value)
      ? repoRoot !== null && value === repoRoot
      : Boolean(currentProject) && keyByValue.get(value) === currentProject;

  // Current group first, then by most recent activity — the orderProjects
  // comparator, applied over the (possibly repo-collapsed) group values.
  const values = [...counts.keys()].sort((a, b) => {
    if (isCurrentValue(a)) return -1;
    if (isCurrentValue(b)) return 1;
    return (latest.get(b) ?? 0) - (latest.get(a) ?? 0);
  });

  const opts: ProjectOption[] = [
    { value: "current", label: "This Project", count: currentCount, isCurrent: false },
    { value: "all", label: "All Projects", count: totalCount, isCurrent: false },
  ];
  for (const value of values) {
    opts.push({
      value,
      label: labelByValue.get(value) ?? value,
      count: counts.get(value) ?? 0,
      isCurrent: isCurrentValue(value),
    });
  }
  return opts;
}

/** One option for the branch filter dropdown. `isCurrent` flags the workspace branch. */
export interface BranchOption {
  value: string;
  label: string;
  count: number;
  isCurrent: boolean;
}

/**
 * Branch-filter options scoped to the active project filter, with per-branch
 * session counts and the workspace's current branch sorted first + marked —
 * restores the v1 `branchDropdown.ts` behaviour. Leads with "All Branches"
 * (total in scope). Single O(N) pass.
 */
export function buildBranchOptions(
  sessions: Session[],
  deleted: Set<string>,
  currentBranch: string,
  project: string,
  currentProject: string,
): BranchOption[] {
  const inScope = (s: Session): boolean => {
    if (project === "all") return true;
    if (project === "current") return !currentProject || s.projectKey === currentProject;
    return s.project === project;
  };

  const counts = new Map<string, number>();
  const latest = new Map<string, number>();
  let total = 0;
  for (const s of sessions) {
    if (deleted.has(s.id)) continue;
    if (!inScope(s)) continue;
    total++;
    const key = s.branch || "(no branch)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (s.endTime > (latest.get(key) ?? 0)) latest.set(key, s.endTime);
  }

  const branches = [...counts.keys()].sort((a, b) => {
    if (a === currentBranch && b !== currentBranch) return -1;
    if (b === currentBranch && a !== currentBranch) return 1;
    return (latest.get(b) ?? 0) - (latest.get(a) ?? 0);
  });

  const opts: BranchOption[] = [
    { value: "all", label: "All Branches", count: total, isCurrent: false },
  ];
  for (const b of branches) {
    opts.push({ value: b, label: b, count: counts.get(b) ?? 0, isCurrent: b === currentBranch });
  }
  return opts;
}
