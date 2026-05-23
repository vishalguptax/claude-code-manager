/**
 * Pure project / branch option builders for the sessions filter dropdowns.
 *
 * These take every input explicitly (the raw session list, the deleted-id set,
 * the current project / branch, the active project filter) so they hold no
 * dependency on the reactive signal layer and stay trivially unit-testable. The
 * model segment wraps them in thin selectors that read the live signal values.
 */
import type { Session } from "../../types";

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
}

/**
 * Project-filter options with per-project session counts — restores the v1
 * count badges. Leads with "This Project" (count of current-project sessions)
 * and "All Projects" (total non-deleted), then every project by recency.
 * Single O(N) pass over sessions, mirroring v1 `updateDropdown`.
 */
export function buildProjectOptions(
  sessions: Session[],
  deleted: Set<string>,
  currentProject: string,
): ProjectOption[] {
  const counts = new Map<string, number>();
  let currentCount = 0;
  let totalCount = 0;
  for (const s of sessions) {
    if (deleted.has(s.id)) continue;
    totalCount++;
    counts.set(s.project, (counts.get(s.project) ?? 0) + 1);
    if (currentProject && s.projectKey === currentProject) currentCount++;
  }

  const opts: ProjectOption[] = [
    { value: "current", label: "This Project", count: currentCount },
    { value: "all", label: "All Projects", count: totalCount },
  ];
  for (const p of orderProjects(sessions, deleted, currentProject)) {
    opts.push({ value: p, label: p, count: counts.get(p) ?? 0 });
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
