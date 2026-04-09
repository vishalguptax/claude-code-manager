/**
 * Base types shared across all features.
 */

/** Persisted user state for pinned, soft-deleted, and renamed items. */
export interface UserState {
  /** Session IDs pinned to the top of the list */
  pinned: string[];
  /** Session IDs hidden from the list */
  deleted: string[];
  /** Map of session ID -> user-assigned name (takes precedence over CLI rename) */
  renames: Record<string, string>;
}
