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

/** One day's token usage per model. */
export interface DailyTokens {
  date: string;
  /** Sum across all models for this day */
  total: number;
}

/** Per-model cumulative stats from stats-cache.json modelUsage. */
export interface ModelStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** input + output (what Claude CLI shows as "total") */
  totalTokens: number;
}

/**
 * Aggregated usage statistics — all computed from ~/.claude/stats-cache.json
 * which is what Claude Code itself writes and reads. Numbers here match what
 * Claude's /stats screen shows.
 */
export interface UsageStats {
  /** Daily activity rows (for heatmap + aggregates) */
  daily: DailyActivity[];
  /** Per-day token totals (for time period filtering) */
  dailyTokens: DailyTokens[];
  /** Number of days with any activity */
  activeDays: number;
  /** Total days in the tracked range (first to last) */
  totalDays: number;
  /** Most active day label */
  mostActiveDay: string;
  /** Longest consecutive-day streak */
  longestStreak: number;
  /** Current consecutive-day streak */
  currentStreak: number;
  /** Per-model breakdown from modelUsage, sorted by totalTokens desc */
  byModel: ModelStats[];
  /** Favorite model (highest total tokens) */
  favoriteModel: string;
  /** Grand total input tokens across all models */
  totalInputTokens: number;
  /** Grand total output tokens across all models */
  totalOutputTokens: number;
  /** Grand total (input + output) across all models — matches CLI */
  totalTokens: number;
  /** Total sessions (from stats-cache.totalSessions) */
  totalSessions: number;
  /** Total messages (from stats-cache.totalMessages) */
  totalMessages: number;
  /** Longest session duration in milliseconds */
  longestSessionMs: number;
  /** First session date */
  firstSessionDate: string;
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
