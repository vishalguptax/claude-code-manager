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
  /**
   * Session IDs the user has archived by hand.
   *
   * Distinct from `deleted`: archiving hides a session from the default
   * list but keeps it findable and restorable, where deleting is the
   * user saying they never want to see it again. Claude Code itself
   * draws the same line — it archives idle sessions rather than
   * removing them.
   */
  archived: string[];
  /** Map of session ID -> the name of the folder the user filed it in. */
  folders: Record<string, string>;
  /**
   * Every folder the user has made, including empty ones — the explorer
   * creates a folder first and fills it after. Always a superset of the
   * names in {@link UserState.folders}; `loadState` restores that invariant
   * for state files written before this list existed.
   */
  folderNames: string[];
}
