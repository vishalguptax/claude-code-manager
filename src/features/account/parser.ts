/**
 * Account data parser — reads profile, usage stats, settings, and permissions
 * from Claude CLI data files.
 *
 * Security: this parser is the ONLY place that reads .credentials.json. It
 * strips OAuth tokens (accessToken, refreshToken) before returning anything,
 * so tokens never cross the extension/webview boundary.
 *
 * Usage stats come exclusively from ~/.claude/stats-cache.json which is what
 * Claude Code itself writes. We do NOT walk session JSONL files to compute
 * token counts — Claude's /stats screen uses a formula we can't reproduce
 * and producing a different number would be misleading.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CLAUDE_DIR } from "../../core/config";
import type {
  AccountData,
  AccountProfile,
  AccountSettings,
  DailyActivity,
  DailyTokens,
  ModelStats,
  PermissionScope,
  PermissionSet,
  UsageStats,
} from "./types";

const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");
const CREDENTIALS_FILE = path.join(CLAUDE_DIR, ".credentials.json");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
const STATS_CACHE_FILE = path.join(CLAUDE_DIR, "stats-cache.json");
const LOCAL_SETTINGS_NAME = "settings.local.json";
const PROJECT_SETTINGS_NAME = "settings.json";

// ── Profile ──

/**
 * Parse profile data from .claude.json (account info) and .credentials.json
 * (subscription). Tokens are read but never returned.
 */
function parseProfile(): AccountProfile {
  const profile: AccountProfile = {
    email: "",
    displayName: "",
    organizationName: "",
    organizationRole: "",
    subscriptionType: "",
    rateLimitTier: "",
    accountCreatedAt: "",
    subscriptionCreatedAt: "",
    signedIn: false,
    tokenExpiresAt: 0,
    userID: "",
    startupCount: 0,
    firstUseDate: "",
  };

  // ~/.claude.json — oauthAccount + startup history
  try {
    const raw = fs.readFileSync(CLAUDE_JSON, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const oauth = data.oauthAccount as Record<string, unknown> | undefined;
    if (oauth) {
      profile.email = typeof oauth.emailAddress === "string" ? oauth.emailAddress : "";
      profile.displayName = typeof oauth.displayName === "string" ? oauth.displayName : "";
      profile.organizationName =
        typeof oauth.organizationName === "string" ? oauth.organizationName : "";
      profile.organizationRole =
        typeof oauth.organizationRole === "string" ? oauth.organizationRole : "";
      profile.accountCreatedAt =
        typeof oauth.accountCreatedAt === "string" ? oauth.accountCreatedAt : "";
      profile.subscriptionCreatedAt =
        typeof oauth.subscriptionCreatedAt === "string" ? oauth.subscriptionCreatedAt : "";
    }
    if (typeof data.userID === "string") profile.userID = data.userID;
    if (typeof data.numStartups === "number") profile.startupCount = data.numStartups;
    if (typeof data.claudeCodeFirstTokenDate === "string") {
      profile.firstUseDate = data.claudeCodeFirstTokenDate;
    } else if (typeof data.firstStartTime === "string") {
      profile.firstUseDate = data.firstStartTime;
    }
  } catch {
    // file may not exist yet
  }

  // .credentials.json — subscription only, tokens NEVER exposed
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const oauth = data.claudeAiOauth as Record<string, unknown> | undefined;
    if (oauth) {
      profile.signedIn = true;
      if (typeof oauth.subscriptionType === "string") {
        profile.subscriptionType = oauth.subscriptionType;
      }
      if (typeof oauth.rateLimitTier === "string") {
        profile.rateLimitTier = oauth.rateLimitTier;
      }
      if (typeof oauth.expiresAt === "number") {
        profile.tokenExpiresAt = oauth.expiresAt;
      }
    }
  } catch {
    // not signed in
  }

  return profile;
}

// ── Usage stats (stats-cache.json only) ──

/**
 * Read all usage stats from stats-cache.json.
 *
 * This cache file is written by Claude Code itself and contains pre-computed
 * totals (totalSessions, totalMessages, modelUsage, etc.) plus per-day arrays.
 * All numbers here match what /stats shows in the CLI because we read from
 * the same source.
 */
function parseUsage(): UsageStats {
  const result: UsageStats = {
    daily: [],
    dailyTokens: [],
    activeDays: 0,
    totalDays: 0,
    mostActiveDay: "",
    longestStreak: 0,
    currentStreak: 0,
    byModel: [],
    favoriteModel: "",
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalSessions: 0,
    totalMessages: 0,
    longestSessionMs: 0,
    firstSessionDate: "",
  };

  type StatsCache = {
    dailyActivity?: DailyActivity[];
    dailyModelTokens?: Array<{ date: string; tokensByModel: Record<string, number> }>;
    modelUsage?: Record<
      string,
      { inputTokens?: number; outputTokens?: number }
    >;
    totalSessions?: number;
    totalMessages?: number;
    longestSession?: { duration?: number };
    firstSessionDate?: string;
  };

  let cache: StatsCache;
  try {
    const raw = fs.readFileSync(STATS_CACHE_FILE, "utf-8");
    cache = JSON.parse(raw) as StatsCache;
  } catch {
    return result;
  }

  // ── Daily activity (heatmap + filtering) ──
  if (Array.isArray(cache.dailyActivity)) {
    result.daily = cache.dailyActivity.filter(
      (d): d is DailyActivity =>
        typeof d === "object" &&
        d !== null &&
        typeof d.date === "string" &&
        typeof d.messageCount === "number" &&
        typeof d.sessionCount === "number" &&
        typeof d.toolCallCount === "number",
    );
  }

  // ── Per-day token totals (sum across models in each day's bucket) ──
  if (Array.isArray(cache.dailyModelTokens)) {
    const tokenDays: DailyTokens[] = [];
    for (const entry of cache.dailyModelTokens) {
      if (!entry || typeof entry.date !== "string" || typeof entry.tokensByModel !== "object") {
        continue;
      }
      let sum = 0;
      for (const v of Object.values(entry.tokensByModel)) {
        if (typeof v === "number") sum += v;
      }
      tokenDays.push({ date: entry.date, total: sum });
    }
    tokenDays.sort((a, b) => a.date.localeCompare(b.date));
    result.dailyTokens = tokenDays;
  }

  // ── Per-model breakdown from modelUsage ──
  if (cache.modelUsage && typeof cache.modelUsage === "object") {
    const modelList: ModelStats[] = [];
    for (const [model, usage] of Object.entries(cache.modelUsage)) {
      if (!usage || typeof usage !== "object") continue;
      const input = typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
      const output = typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
      modelList.push({
        model,
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
      });
      result.totalInputTokens += input;
      result.totalOutputTokens += output;
    }
    modelList.sort((a, b) => b.totalTokens - a.totalTokens);
    result.byModel = modelList;
    result.favoriteModel = modelList[0]?.model ?? "";
    result.totalTokens = result.totalInputTokens + result.totalOutputTokens;
  }

  // ── Scalar totals ──
  if (typeof cache.totalSessions === "number") result.totalSessions = cache.totalSessions;
  if (typeof cache.totalMessages === "number") result.totalMessages = cache.totalMessages;
  if (cache.longestSession && typeof cache.longestSession.duration === "number") {
    result.longestSessionMs = cache.longestSession.duration;
  }
  if (typeof cache.firstSessionDate === "string") result.firstSessionDate = cache.firstSessionDate;

  // ── Derived: most active day, streaks, day span ──
  let maxDay = "";
  let maxMessages = -1;
  for (const d of result.daily) {
    if (d.messageCount > maxMessages) {
      maxMessages = d.messageCount;
      maxDay = d.date;
    }
  }
  result.activeDays = result.daily.length;
  result.mostActiveDay = maxDay;

  if (result.daily.length > 0) {
    const first = new Date(result.daily[0].date).getTime();
    const last = new Date(result.daily[result.daily.length - 1].date).getTime();
    result.totalDays = Math.max(1, Math.round((last - first) / 86400000) + 1);
  }

  // Longest consecutive-day streak
  const sorted = [...result.daily].sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (!prev) {
      run = 1;
    } else {
      const prevMs = new Date(prev).getTime();
      const curMs = new Date(d.date).getTime();
      const diff = Math.round((curMs - prevMs) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    }
    if (run > longest) longest = run;
    prev = d.date;
  }
  result.longestStreak = longest;

  // Current streak
  const activeDates = new Set(result.daily.map((d) => d.date));
  const fmt = (d: Date): string => d.toISOString().slice(0, 10);
  let current = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (activeDates.has(fmt(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  result.currentStreak = current;

  return result;
}

// ── Settings ──

/**
 * Parse settings.json for the keys we support in the UI.
 */
function parseSettings(): AccountSettings {
  const result: AccountSettings = {
    model: "",
    voiceEnabled: false,
    commitAttribution: "",
    prAttribution: "",
    statusLineCommand: "",
  };

  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.model === "string") result.model = data.model;
    if (typeof data.voiceEnabled === "boolean") result.voiceEnabled = data.voiceEnabled;
    const attribution = data.attribution as Record<string, unknown> | undefined;
    if (attribution) {
      if (typeof attribution.commit === "string") result.commitAttribution = attribution.commit;
      if (typeof attribution.pr === "string") result.prAttribution = attribution.pr;
    }
    const statusLine = data.statusLine as Record<string, unknown> | undefined;
    if (statusLine && typeof statusLine.command === "string") {
      result.statusLineCommand = statusLine.command;
    }
  } catch {
    // file may not exist
  }

  return result;
}

// ── Permissions ──

/**
 * Read permissions arrays from a single settings file.
 */
function readPermissionFile(filePath: string, scope: PermissionScope): PermissionSet {
  const result: PermissionSet = { scope, allow: [], deny: [] };
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const perms = data.permissions as Record<string, unknown> | undefined;
    if (perms) {
      if (Array.isArray(perms.allow)) {
        result.allow = (perms.allow as unknown[]).filter((x): x is string => typeof x === "string");
      }
      if (Array.isArray(perms.deny)) {
        result.deny = (perms.deny as unknown[]).filter((x): x is string => typeof x === "string");
      }
    }
  } catch {
    // file doesn't exist — empty permissions
  }
  return result;
}

/**
 * Read permissions from all three scopes (global, project, local).
 */
function parsePermissions(workspacePath?: string): PermissionSet[] {
  const result: PermissionSet[] = [];
  result.push(readPermissionFile(SETTINGS_FILE, "global"));
  if (workspacePath) {
    result.push(
      readPermissionFile(path.join(workspacePath, ".claude", PROJECT_SETTINGS_NAME), "project"),
    );
    result.push(
      readPermissionFile(path.join(workspacePath, ".claude", LOCAL_SETTINGS_NAME), "local"),
    );
  }
  return result;
}

// ── Main entry ──

/**
 * Parse all account data. Safe to call often — reads small files only.
 */
export function parseAccountData(workspacePath?: string): AccountData {
  return {
    profile: parseProfile(),
    usage: parseUsage(),
    settings: parseSettings(),
    permissions: parsePermissions(workspacePath),
  };
}

// ── Writers ──

/**
 * Update a single key in settings.json, preserving other keys.
 * Supports nested keys with dot notation (e.g., "attribution.commit").
 */
export function writeSettingsValue(
  key: string,
  value: unknown,
  scope: PermissionScope = "global",
  workspacePath?: string,
): boolean {
  const filePath = resolveSettingsPath(scope, workspacePath);
  if (!filePath) return false;

  let data: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // create new file
  }

  const parts = key.split(".");
  let target: Record<string, unknown> = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof target[k] !== "object" || target[k] === null || Array.isArray(target[k])) {
      target[k] = {};
    }
    target = target[k] as Record<string, unknown>;
  }

  if (value === undefined || value === null || value === "") {
    delete target[parts[parts.length - 1]];
  } else {
    target[parts[parts.length - 1]] = value;
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/**
 * Add a tool to a permissions list (allow or deny) at the given scope.
 */
export function addPermissionEntry(
  scope: PermissionScope,
  tool: string,
  list: "allow" | "deny",
  workspacePath?: string,
): boolean {
  const filePath = resolveSettingsPath(scope, workspacePath);
  if (!filePath) return false;

  let data: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // create new
  }

  if (typeof data.permissions !== "object" || data.permissions === null) {
    data.permissions = {};
  }
  const perms = data.permissions as Record<string, unknown>;
  if (!Array.isArray(perms[list])) perms[list] = [];
  const arr = perms[list] as string[];
  if (!arr.includes(tool)) arr.push(tool);

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a tool from a permissions list at the given scope.
 */
export function removePermissionEntry(
  scope: PermissionScope,
  tool: string,
  list: "allow" | "deny",
  workspacePath?: string,
): boolean {
  const filePath = resolveSettingsPath(scope, workspacePath);
  if (!filePath) return false;

  let data: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }

  const perms = data.permissions as Record<string, unknown> | undefined;
  if (!perms) return false;
  const arr = perms[list] as unknown;
  if (!Array.isArray(arr)) return false;
  const idx = arr.indexOf(tool);
  if (idx < 0) return false;
  arr.splice(idx, 1);

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the settings file path for a given scope.
 */
export function resolveSettingsPath(
  scope: PermissionScope,
  workspacePath?: string,
): string | null {
  if (scope === "global") return SETTINGS_FILE;
  if (!workspacePath) return null;
  if (scope === "project") return path.join(workspacePath, ".claude", PROJECT_SETTINGS_NAME);
  if (scope === "local") return path.join(workspacePath, ".claude", LOCAL_SETTINGS_NAME);
  return null;
}
