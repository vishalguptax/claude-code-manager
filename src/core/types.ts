/**
 * Base types shared across all features.
 */

/** Persisted user state for pinned, archived, filed and renamed sessions. */
export interface UserState {
  /** Session IDs pinned to the top of the list */
  pinned: string[];
  /** Map of session ID -> user-assigned name (takes precedence over CLI rename) */
  renames: Record<string, string>;
  /**
   * Session IDs the user has archived by hand.
   *
   * Archiving hides a session from the default list but keeps it findable
   * and restorable. Deleting is different: it removes the session's data
   * from disk (see sessionFiles), so a deleted session needs no entry here.
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
