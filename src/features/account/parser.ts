/**
 * Account data parser — reads profile, usage stats, settings, and permissions
 * from Claude CLI data files.
 *
 * Security: this parser is the ONLY place that reads .credentials.json. It
 * strips OAuth tokens (accessToken, refreshToken) before returning anything,
 * so tokens never cross the extension/webview boundary.
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
  const empty: AccountProfile = {
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
      empty.email = typeof oauth.emailAddress === "string" ? oauth.emailAddress : "";
      empty.displayName = typeof oauth.displayName === "string" ? oauth.displayName : "";
      empty.organizationName =
        typeof oauth.organizationName === "string" ? oauth.organizationName : "";
      empty.organizationRole =
        typeof oauth.organizationRole === "string" ? oauth.organizationRole : "";
      empty.accountCreatedAt =
        typeof oauth.accountCreatedAt === "string" ? oauth.accountCreatedAt : "";
      empty.subscriptionCreatedAt =
        typeof oauth.subscriptionCreatedAt === "string" ? oauth.subscriptionCreatedAt : "";
    }
    if (typeof data.userID === "string") empty.userID = data.userID;
    if (typeof data.numStartups === "number") empty.startupCount = data.numStartups;
    if (typeof data.claudeCodeFirstTokenDate === "string") {
      empty.firstUseDate = data.claudeCodeFirstTokenDate;
    } else if (typeof data.firstStartTime === "string") {
      empty.firstUseDate = data.firstStartTime;
    }
  } catch {
    // file may not exist yet
  }

  // .credentials.json — subscription only, tokens are NEVER exposed
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const oauth = data.claudeAiOauth as Record<string, unknown> | undefined;
    if (oauth) {
      empty.signedIn = true;
      if (typeof oauth.subscriptionType === "string") {
        empty.subscriptionType = oauth.subscriptionType;
      }
      if (typeof oauth.rateLimitTier === "string") {
        empty.rateLimitTier = oauth.rateLimitTier;
      }
      if (typeof oauth.expiresAt === "number") {
        empty.tokenExpiresAt = oauth.expiresAt;
      }
    }
  } catch {
    // not signed in
  }

  return empty;
}

// ── Usage stats ──

/**
 * Read daily activity from stats-cache.json and compute aggregate stats.
 */
function parseUsage(): UsageStats {
  const result: UsageStats = {
    daily: [],
    totalMessages: 0,
    totalSessions: 0,
    totalToolCalls: 0,
    activeDays: 0,
    totalDays: 0,
    mostActiveDay: "",
    longestStreak: 0,
    currentStreak: 0,
  };

  let daily: DailyActivity[] = [];
  try {
    const raw = fs.readFileSync(STATS_CACHE_FILE, "utf-8");
    const data = JSON.parse(raw) as { dailyActivity?: DailyActivity[] };
    if (Array.isArray(data.dailyActivity)) {
      daily = data.dailyActivity.filter(
        (d): d is DailyActivity =>
          typeof d === "object" &&
          d !== null &&
          typeof d.date === "string" &&
          typeof d.messageCount === "number" &&
          typeof d.sessionCount === "number" &&
          typeof d.toolCallCount === "number",
      );
    }
  } catch {
    return result;
  }

  result.daily = daily;

  let maxDay = "";
  let maxMessages = -1;
  for (const d of daily) {
    result.totalMessages += d.messageCount;
    result.totalSessions += d.sessionCount;
    result.totalToolCalls += d.toolCallCount;
    if (d.messageCount > maxMessages) {
      maxMessages = d.messageCount;
      maxDay = d.date;
    }
  }
  result.activeDays = daily.length;
  result.mostActiveDay = maxDay;

  // Compute total-day span from first to last
  if (daily.length > 0) {
    const first = new Date(daily[0].date).getTime();
    const last = new Date(daily[daily.length - 1].date).getTime();
    result.totalDays = Math.max(1, Math.round((last - first) / 86400000) + 1);
  }

  // Compute streaks — longest and current
  const activeDates = new Set(daily.map((d) => d.date));
  let longest = 0;
  let current = 0;
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));

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

  // Current streak — count back from today
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  let cursor = new Date(today);
  while (activeDates.has(fmt(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  result.longestStreak = longest;
  result.currentStreak = current;

  return result;
}

// ── Settings ──

/**
 * Parse settings.json for the handful of keys we support in the UI.
 * Absent keys return sensible defaults.
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
 * Creates the file if it doesn't exist.
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

  // Support nested keys like "attribution.commit" or "statusLine.command"
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
