/**
 * Type definitions for the account feature.
 * Covers profile data, usage stats, settings, permissions, and webview message protocol.
 *
 * Security note: the parser NEVER exposes OAuth tokens (accessToken, refreshToken).
 * Only derived, safe fields like subscription type, email, and expiry are passed.
 */

// ── Profile ──

/** Parsed profile data from ~/.claude.json and ~/.claude/.credentials.json. */
export interface AccountProfile {
  /** Email address from oauthAccount */
  email: string;
  /** Display name from oauthAccount */
  displayName: string;
  /** Organization name */
  organizationName: string;
  /** Organization role (admin / member) */
  organizationRole: string;
  /** Subscription type: "max" | "pro" | "team" | "free" | unknown */
  subscriptionType: string;
  /** Rate limit tier slug */
  rateLimitTier: string;
  /** Account created ISO timestamp */
  accountCreatedAt: string;
  /** Subscription created ISO timestamp */
  subscriptionCreatedAt: string;
  /** Whether the user is signed in */
  signedIn: boolean;
  /** OAuth token expiration timestamp (ms) — used to compute "expires in X days" */
  tokenExpiresAt: number;
  /** User ID from .claude.json */
  userID: string;
  /** Number of Claude Code startups */
  startupCount: number;
  /** First use date (ISO) */
  firstUseDate: string;
}

// ── Usage / Stats ──

/** One day's activity from stats-cache.json. */
export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

/** Per-model token breakdown. */
export interface ModelStats {
  model: string;
  tokens: number;
  messages: number;
}

/** Aggregated usage statistics. */
export interface UsageStats {
  /** Daily activity rows (for heatmap) */
  daily: DailyActivity[];
  /** Total messages across all time */
  totalMessages: number;
  /** Total sessions across all time */
  totalSessions: number;
  /** Total tool calls across all time */
  totalToolCalls: number;
  /** Number of days with any activity */
  activeDays: number;
  /** Total days tracked */
  totalDays: number;
  /** Most active day label */
  mostActiveDay: string;
  /** Longest consecutive-day streak */
  longestStreak: number;
  /** Current consecutive-day streak */
  currentStreak: number;
  /** Total input tokens (input + cache creation + cache read) */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Grand total tokens across all sessions */
  totalTokens: number;
  /** Per-model breakdown sorted by tokens desc */
  byModel: ModelStats[];
  /** Favorite model (most tokens used) */
  favoriteModel: string;
}

// ── Settings (from settings.json) ──

/** Parsed settings from ~/.claude/settings.json. */
export interface AccountSettings {
  /** Current model setting: "sonnet" | "opus" | "haiku" | "" (default) */
  model: string;
  /** Voice dictation enabled */
  voiceEnabled: boolean;
  /** Git commit attribution line */
  commitAttribution: string;
  /** Git PR attribution line */
  prAttribution: string;
  /** Status line command */
  statusLineCommand: string;
}

// ── Permissions ──

/** Scope of a permissions file. */
export type PermissionScope = "global" | "project" | "local";

/** Permissions from one settings file. */
export interface PermissionSet {
  scope: PermissionScope;
  allow: string[];
  deny: string[];
}

// ── Full payload ──

/** Full account data payload sent from extension to webview. */
export interface AccountData {
  profile: AccountProfile;
  usage: UsageStats;
  settings: AccountSettings;
  permissions: PermissionSet[];
}

// ── Messages ──

/** Messages sent from the extension host to the webview for the account feature. */
export type AccountExtensionMessage =
  | { type: "accountData"; data: AccountData }
  | { type: "accountError"; message: string };

/** Messages sent from the webview to the extension host for the account feature. */
export type AccountWebviewMessage =
  | { type: "getAccountData" }
  | { type: "openAccountUrl"; url: string }
  | { type: "launchSlash"; command: string }
  | { type: "setModel"; model: string }
  | { type: "setVoiceEnabled"; value: boolean }
  | { type: "setCommitAttribution"; value: string }
  | { type: "setPrAttribution"; value: string }
  | { type: "openSettingsFile"; scope: PermissionScope }
  | { type: "addPermission"; scope: PermissionScope; tool: string; list: "allow" | "deny" }
  | { type: "removePermission"; scope: PermissionScope; tool: string; list: "allow" | "deny" };
