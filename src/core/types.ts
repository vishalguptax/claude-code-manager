/**
 * Base types shared across all features.
 */

/** Persisted user state for pinned and soft-deleted items. */
export interface UserState {
  /** Session IDs pinned to the top of the list */
  pinned: string[];
  /** Session IDs hidden from the list */
  deleted: string[];
}
