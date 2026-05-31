/**
 * Barrel for the shell-side per-tab loading skeletons. These render while a
 * feature chunk is being lazy-imported (TabPanel) and again from each
 * feature's own loading branch once mounted — same component, one source.
 */
export { AccountSkeleton } from "./AccountSkeleton";
export { ConfigSkeleton } from "./ConfigSkeleton";
export { resolveTabSkeleton, tabSkeletons } from "./registry";
export { SessionsSkeleton } from "./SessionsSkeleton";
