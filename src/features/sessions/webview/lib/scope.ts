/**
 * The single definition of "which sessions are in scope", shared by the list
 * itself and by every filter dropdown that reports a count.
 *
 * Why it exists: getFiltered and each option builder used to re-implement this
 * independently, and they drifted. The builders applied the project scope but
 * ignored the date and worktree filters, so with "This Project" + "7 days" the
 * branch dropdown advertised counts from all time — on a real profile it
 * offered "(no branch) 71" against a list showing 2, and "ops-fe-baseline 39"
 * against 15. Picking a branch then looked broken, because the number that
 * invited the click was describing a different list.
 *
 * Faceted-filter convention: a dropdown's counts apply every OTHER active
 * filter but not its own dimension, so the user can see what switching to each
 * option would give. `except` names the dimension to skip.
 */
import type { Session } from "../../types";
import {
  matchesWorktreeFilter,
  type WorktreeFilter,
  type WorktreeMap,
} from "./worktrees";

/** One filter dimension, as named by the dropdown that owns it. */
export type FilterDimension = "project" | "date" | "branch" | "worktree";

/** Every input the scope rules read. Passed explicitly — no signal access. */
export interface FilterScope {
  deleted: Set<string>;
  pinned: Set<string>;
  /**
   * Session IDs the user archived. Excluded from the list unless
   * {@link FilterScope.showArchived} is on — archiving means "out of my
   * way", not "gone", so the rows stay reachable behind a toggle where
   * deleted ones do not.
   */
  archived: Set<string>;
  /** When true the archived rows are shown instead of hidden. */
  showArchived: boolean;
  /** "current" | "all" | a repoRoot | a project name. */
  project: string;
  /** Lowercased folder name of the open workspace, "" when unresolved. */
  currentProject: string;
  /** "recent" | "week" | "month" | "all" (anything else = no cutoff). */
  date: string;
  /** "all" or an exact branch label, with "(no branch)" for unset. */
  branch: string;
  /** "all" or a worktree kind. */
  worktree: WorktreeFilter;
  worktrees: WorktreeMap;
  /** repoRoot of the workspace when it sits in a git repo, else null. */
  repoRoot: string | null;
  /** Injected so date cutoffs are testable. */
  now: number;
}

/** True when the session belongs to the scope's project selection. */
export function matchesProject(s: Session, scope: FilterScope): boolean {
  const { project, worktrees, repoRoot, currentProject } = scope;
  if (project === "all") return true;
  if (project === "current") {
    // Unknown scope (workspace not resolved yet) shows everything rather than
    // an empty list that reads as "no sessions".
    if (!repoRoot && !currentProject) return true;
    // A session with no worktree ref still belongs to the project when its
    // folder matches. Comparing only the ref dropped sessions whose directory
    // git could not resolve, and every session in the window between the list
    // painting and the deferred `worktrees` message landing.
    if (repoRoot && worktrees[s.id]?.repoRoot === repoRoot) return true;
    return Boolean(currentProject) && s.projectKey === currentProject;
  }
  // A concrete selection is a repoRoot (the dropdown collapses each repo's
  // worktrees under one option) or a plain project name. Accept either, so a
  // selection persisted before worktree refs resolved still matches.
  const ref = worktrees[s.id];
  if (ref && ref.repoRoot === project) return true;
  return s.project === project;
}

/** True when the session falls inside the scope's date window. */
export function matchesDate(s: Session, scope: FilterScope): boolean {
  const { date, now, pinned } = scope;
  if (date !== "week" && date !== "month") return true;
  const cutoff = date === "week" ? now - 7 * 86400000 : now - 30 * 86400000;
  // Pins bypass the cutoff so a deliberately kept session never ages out.
  return s.endTime >= cutoff || pinned.has(s.id);
}

/** True when the session matches the scope's branch selection. */
export function matchesBranch(s: Session, scope: FilterScope): boolean {
  if (scope.branch === "all") return true;
  // Unlike the date cutoff, a pin does NOT bypass this: a pinned session on a
  // different branch leaking into a branch view made the row count exceed the
  // dropdown's badge.
  return (s.branch || "(no branch)") === scope.branch;
}

/** True when the session matches the scope's worktree-kind selection. */
export function matchesWorktree(s: Session, scope: FilterScope): boolean {
  if (scope.worktree === "all") return true;
  return matchesWorktreeFilter(s, scope.worktrees, scope.worktree);
}

/**
 * True when the session passes every dimension of the scope except `except`.
 * Deleted sessions never pass.
 */
export function matchesScope(
  s: Session,
  scope: FilterScope,
  except?: FilterDimension,
): boolean {
  if (scope.deleted.has(s.id)) return false;
  // Archived rows are hidden by default and shown EXCLUSIVELY when the
  // toggle is on: mixing them back into the ordinary list would make the
  // toggle read as "show more" rather than "show the archive".
  if (scope.showArchived !== scope.archived.has(s.id)) return false;
  if (except !== "project" && !matchesProject(s, scope)) return false;
  if (except !== "date" && !matchesDate(s, scope)) return false;
  if (except !== "branch" && !matchesBranch(s, scope)) return false;
  if (except !== "worktree" && !matchesWorktree(s, scope)) return false;
  return true;
}
