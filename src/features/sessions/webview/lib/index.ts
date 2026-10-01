/**
 * Barrel for the sessions `lib` segment — pure, signal-free list/option shaping
 * helpers. No JSX, no signal reads.
 */
export {
  buildRows,
  flattenGroups,
  sessionDayLabel,
  type Row,
} from "./groups";
export {
  matchesScope,
  matchesProject,
  matchesDate,
  matchesBranch,
  matchesWorktree,
  type FilterDimension,
  type FilterScope,
} from "./scope";
export {
  buildBranchOptions,
  buildProjectOptions,
  listBranches,
  type BranchOption,
  type ProjectOption,
} from "./options";
export {
  buildWorktreeOptions,
  currentRepoRoot,
  hasWorktrees,
  isOtherProject,
  isSameRepo,
  matchesWorktreeFilter,
  pathTail,
  projectGroupValue,
  type WorktreeFilter,
  type WorktreeMap,
  type WorktreeOption,
  type WorkspaceScope,
} from "./worktrees";
