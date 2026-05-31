/**
 * Barrel for the sessions `lib` segment — pure, signal-free list/option shaping
 * helpers. No JSX, no signal reads.
 */
export { buildRows, flattenGroups, type Row } from "./groups";
export {
  buildBranchOptions,
  buildProjectOptions,
  listBranches,
  orderProjects,
  type BranchOption,
  type ProjectOption,
} from "./options";
