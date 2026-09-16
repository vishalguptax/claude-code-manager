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
  /**
   * Map of session ID -> epoch ms when the user last opened it.
   *
   * A session reads as unread when its newest activity is later than
   * its mark. The absence of an entry means "never opened", which is
   * only meaningful for sessions that postdate {@link unreadBaseline}.
   */
  readAt: Record<string, number>;
  /**
   * Epoch ms when unread tracking began on this machine, or 0 before it
   * has been established.
   *
   * Without it, turning the feature on marks every session in the
   * user's history unread at once — a dot on all 77 rows carries no
   * more information than a dot on none. Sessions whose last activity
   * predates the baseline are treated as already read, so the marker
   * only ever means "this changed since you started tracking".
   */
  unreadBaseline: number;
}
