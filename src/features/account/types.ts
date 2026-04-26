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
  /**
   * True when ~/.claude.json is empty or invalid AND we successfully
   * loaded a backup — signals "config was corrupted but we recovered".
   * Webview shows a restore banner so the user can rewrite the primary
   * file from the backup before Claude CLI trips its own reset prompt.
   */
  configCorrupted: boolean;
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
  /** Tokens served from the prompt cache. 0 when the model never cached. */
  cacheReadTokens: number;
  /** Tokens written to the prompt cache. 0 when caching unused. */
  cacheCreationTokens: number;
  /**
   * Computed USD cost for this model's lifetime token totals using
   * the snapshot in `src/core/pricing.ts`. Approximate by design —
   * see PRICES_EFFECTIVE_DATE on the snapshot for the anchor date.
   */
  costUsd: number;
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
  /**
   * The last date Claude CLI wrote into stats-cache.json. The CLI
   * re-aggregates on its own cadence (often a day or two behind
   * today), so showing this lets users understand any drift between
   * the panel and a fresh terminal `/stats` view. Empty string when
   * the cache is missing the field.
   */
  lastComputedDate: string;
  /**
   * Approximate lifetime USD cost summed across all models. Uses the
   * static price snapshot in `src/core/pricing.ts` — a real billing
   * call would break the local-first promise. Zero when no token
   * data is available.
   */
  totalCostUsd: number;
  /**
   * Snapshot date of the prices used to compute `totalCostUsd` and
   * `byModel[].costUsd`. Surface this in the UI so users know how
   * stale the figure is.
   */
  pricesEffectiveDate: string;
}

// ── Settings (from settings.json) ──

/**
 * Permission mode — one of Claude Code's built-in default-mode values.
 * Controls how the CLI handles tool-use confirmations:
 *   - "default"          — prompt per tool call (safest)
 *   - "acceptEdits"      — auto-approve file edits
 *   - "plan"             — plan-first mode; requires explicit proceed
 *   - "bypassPermissions"— no prompts (most permissive; security risk)
 * Empty string = unset in settings.json (falls back to CLI default).
 */
export type PermissionDefaultMode =
  | ""
  | "default"
  | "acceptEdits"
  | "plan"
  | "bypassPermissions";

/** Parsed settings from ~/.claude/settings.json. */
export interface AccountSettings {
  /** Current model setting: "sonnet" | "opus" | "haiku" | "" (default) */
  model: string;
  /** Voice dictation enabled. Reads both `voiceEnabled` and `voice.enabled`. */
  voiceEnabled: boolean;
  /** Git commit attribution line */
  commitAttribution: string;
  /** Git PR attribution line */
  prAttribution: string;
  /** Status line command */
  statusLineCommand: string;
  /** `includeCoAuthoredBy` — toggles Claude's default co-author trailer. */
  includeCoAuthoredBy: boolean;
  /** `spinnerTipsEnabled` — "Tip:" lines under the spinner. Many users want off. */
  spinnerTipsEnabled: boolean;
  /** `permissions.defaultMode` — how the CLI treats tool-use confirmations. */
  defaultMode: PermissionDefaultMode;
  /** `permissions.additionalDirectories` — paths outside the workspace Claude may read. */
  additionalDirectories: string[];
  /** `cleanupPeriodDays` — session transcript retention in days. 0 means unset. */
  cleanupPeriodDays: number;
  /**
   * `effortLevel` — reasoning-effort preset set by the CLI's `/effort`
   * slash command. Controls how much thinking budget Claude spends
   * before answering. Known values today are
   * `low | medium | high | xhigh | max | auto`, but we store + display
   * whatever string the CLI wrote so a new tier (e.g. a future
   * "ultra") surfaces immediately without an extension update.
   * Empty string = unset (CLI picks its own default).
   */
  effortLevel: string;
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
  /**
   * Models discovered from the installed Claude CLI binary. Includes
   * every version the CLI knows about, not just the latest — so users
   * can pin to a specific older version if they want. Each entry:
   *   - `alias` — the family ("opus", "sonnet", "haiku")
   *   - `family` — same (kept for clarity when grouping)
   *   - `label` — display text like "Opus 4.7"
   *   - `id` — full model ID like "claude-opus-4-7"
   *   - `isLatest` — true if this is the newest version of its family
   *     (the dropdown binds latest to the alias so it auto-updates,
   *     older versions bind to the full ID so they stay pinned)
   */
  availableModels: Array<{
    alias: string;
    family: string;
    label: string;
    id: string;
    isLatest: boolean;
  }>;
  /**
   * Snapshots of other Claude accounts the user has saved via the
   * Accounts section. Each entry is a slot under
   * ~/.claude/manager-accounts/<slug>/ that the user can switch to
   * without going through the full login flow again. Empty array when
   * the user hasn't saved any profile yet.
   */
  savedProfiles: SavedProfile[];
  /**
   * Slug of the profile whose credentials match the live
   * ~/.claude/.credentials.json. Null when the active account has not
   * been saved as a profile yet (user hasn't clicked "Save profile")
   * or when no active account exists.
   */
  activeProfileSlug: string | null;
}

// ── Saved account profile (imported shape from profiles.ts) ──

/**
 * Public view of a saved account snapshot. Mirrors the SavedProfile
 * type defined in `./profiles.ts` — kept here too so types.ts stays
 * the single import target for webview-side code.
 */
export interface SavedProfile {
  slug: string;
  label: string;
  email: string;
  organizationName: string;
  subscriptionType: string;
  savedAt: string;
  tokenExpiresAt: number;
  credentialsHash: string;
  userID: string;
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
