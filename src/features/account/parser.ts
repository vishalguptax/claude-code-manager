/**
 * Account data parser — reads profile, usage stats, settings, and permissions
 * from Claude CLI data files.
 *
 * Security: this parser is the ONLY place that reads .credentials.json. It
 * strips OAuth tokens (accessToken, refreshToken) before returning anything,
 * so tokens never cross the extension/webview boundary.
 *
 * Usage stats come exclusively from ~/.claude/stats-cache.json — the same
 * file Claude CLI writes and reads. Claude rebuilds that cache on its own
 * cadence (often 1–2 days behind today) and the `/stats` view's exact
 * aggregation formula isn't documented. We display what the cache holds
 * verbatim and show `lastComputedDate` so the user knows when it was last
 * refreshed; reverse-engineering Claude's filtered-period math would be a
 * drift-prone workaround, so we don't attempt it.
 */
import * as fs from "fs";
import * as path from "path";
import { discoverModelsFromCli } from "./models";
import { isUsageAggregateWarming } from "./projectStats";
import * as os from "os";
import { CLAUDE_DIR, SETTINGS_FILE, claudeSettingsPath } from "../../core/config";
import { listProfiles, getActiveProfileSlug } from "./profiles";
import { readQuotaHistory } from "./quotaHistory";
import { readCredentials } from "./credentials";
import { readClaudeJsonParsed } from "./claudeJsonCache";
import { computeUsageStats } from "./usage";
import { readStatuslineCache } from "./quota";
import { resolveActiveModel } from "./statuslineCore";
import { writeFileAtomic } from "../../core/atomicWrite";
import { snapshotSettings, listSnapshots, restoreSnapshot, deleteSnapshot } from "./snapshots";
import type { SettingsSnapshot } from "./snapshots";
import { isPermissionDefaultMode } from "./types";
import type {
  AccountData,
  AccountProfile,
  AccountSettings,
  PermissionScope,
  PermissionSet,
} from "./types";

const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");
const CLAUDE_BACKUPS_DIR = path.join(CLAUDE_DIR, "backups");

/**
 * Read and parse .claude.json ONCE, falling back to the most recent
 * backup when the main file is empty or malformed. Claude CLI rotates
 * a copy of this file to ~/.claude/backups/.claude.json.backup.<epoch>
 * on every mutation, so when the primary file gets truncated (as
 * happens occasionally on unexpected shutdowns) the latest backup is
 * almost always intact and contains the current account info.
 *
 * `primaryCorrupted` reports the primary file's health from the same
 * read (the file is large and Claude rewrites it constantly — a
 * separate health-check read would double the cost of every account
 * parse). `data` is null when neither the main file nor any backup
 * yields valid JSON — callers treat that as "profile info unavailable"
 * without surfacing a bare "Unknown" to the user.
 */
function readClaudeJson(): {
  data: Record<string, unknown> | null;
  primaryCorrupted: boolean;
} {
  const tryParse = (filePath: string): Record<string, unknown> | null => {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      if (!raw.trim()) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  // Primary read goes through the mtime/size cache so the several reads a
  // single account-watcher tick makes don't each re-parse the multi-MB file.
  const primary = readClaudeJsonParsed();
  if (primary) return { data: primary, primaryCorrupted: false };

  // Primary file is empty / corrupt / missing — walk the backups
  // newest-first. Whatever they yield, the primary needs restoring, so
  // the caller can surface the recovery banner.
  try {
    const entries = fs.readdirSync(CLAUDE_BACKUPS_DIR);
    // Filter to `.claude.json.backup.<digits>` (NOT the `.corrupted.*`
    // entries, which Claude keeps for forensic purposes). Sort newest
    // first by the embedded epoch timestamp — descending numeric sort.
    const backups = entries
      .filter((n) => /^\.claude\.json\.backup\.\d+$/.test(n))
      .map((n) => ({ name: n, ts: parseInt(n.split(".").pop() ?? "0", 10) }))
      .sort((a, b) => b.ts - a.ts);

    for (const b of backups) {
      const data = tryParse(path.join(CLAUDE_BACKUPS_DIR, b.name));
      if (data) return { data, primaryCorrupted: true };
    }
  } catch {
    // backups dir doesn't exist — give up
  }
  return { data: null, primaryCorrupted: true };
}
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
    accountUuid: "",
    startupCount: 0,
    firstUseDate: "",
    configCorrupted: false,
    credentialSource: "",
  };

  // ~/.claude.json — oauthAccount + startup history. One read reports
  // both the payload (with backup fallback — Claude CLI occasionally
  // leaves this file at 0 bytes after an unclean shutdown) and the
  // primary file's health, which drives the restore-from-backup banner.
  const { data, primaryCorrupted } = readClaudeJson();
  profile.configCorrupted = primaryCorrupted;
  if (data) {
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
      profile.accountUuid =
        typeof oauth.accountUuid === "string" ? oauth.accountUuid : "";
    }
    if (typeof data.userID === "string") profile.userID = data.userID;
    if (typeof data.numStartups === "number") profile.startupCount = data.numStartups;
    if (typeof data.claudeCodeFirstTokenDate === "string") {
      profile.firstUseDate = data.claudeCodeFirstTokenDate;
    } else if (typeof data.firstStartTime === "string") {
      profile.firstUseDate = data.firstStartTime;
    }
  }

  // Credentials — subscription only, tokens NEVER exposed. Source
  // could be a file or macOS Keychain; the credentials module hides
  // the difference so this code path stays identical whichever the
  // Claude CLI chose at install time.
  const live = readCredentials();
  if (live) {
    const oauth = live.blob.claudeAiOauth;
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
    profile.credentialSource = live.source.kind;
  }

  return profile;
}

// ── Usage stats — projected from ~/.claude/stats-cache.json ──
//
// Aggregation lives in `./usage` so `parseAccountData` stays a
// single dispatch point. We read the same file Claude CLI's
// `/stats` reads, which guarantees one set of numbers across the
// extension and the terminal. See usage.ts for the cadence/lag
// tradeoff that comes with that choice.
const parseUsage = computeUsageStats;

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
    includeCoAuthoredBy: true,
    spinnerTipsEnabled: true,
    defaultMode: "",
    additionalDirectories: [],
    cleanupPeriodDays: 0,
    effortLevel: "",
    includeCoAuthoredBySet: false,
    commitAttributionSet: false,
    prAttributionSet: false,
    // Defaults mirror Claude Code's own: these are all "on unless a
    // settings file says otherwise", so an absent key must read as true
    // or the UI would invite the user to re-enable something that was
    // never off.
    alwaysThinkingEnabled: true,
    sandboxEnabled: false,
    disableBypassPermissionsMode: false,
    autoCompactEnabled: true,
    autoCompactWindow: 0,
    fileCheckpointingEnabled: true,
    autoMemoryEnabled: true,
    includeGitInstructions: true,
    outputStyle: "",
    editorMode: "",
    verbose: false,
  };

  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.model === "string") result.model = data.model;
    // Voice enabled lives under two historical keys depending on the
    // CLI version that wrote the file: top-level `voiceEnabled`
    // (legacy) or nested `voice.enabled` (current). Reading both keeps
    // the toggle in sync regardless of which CLI last touched the file.
    if (typeof data.voiceEnabled === "boolean") result.voiceEnabled = data.voiceEnabled;
    const voice = data.voice as Record<string, unknown> | undefined;
    if (voice && typeof voice.enabled === "boolean") result.voiceEnabled = voice.enabled;
    const attribution = data.attribution as Record<string, unknown> | undefined;
    if (attribution) {
      if (typeof attribution.commit === "string") {
        result.commitAttribution = attribution.commit;
        result.commitAttributionSet = true;
      }
      if (typeof attribution.pr === "string") {
        result.prAttribution = attribution.pr;
        result.prAttributionSet = true;
      }
    }
    const statusLine = data.statusLine as Record<string, unknown> | undefined;
    if (statusLine && typeof statusLine.command === "string") {
      result.statusLineCommand = statusLine.command;
    }
    if (typeof data.includeCoAuthoredBy === "boolean") {
      result.includeCoAuthoredBy = data.includeCoAuthoredBy;
      result.includeCoAuthoredBySet = true;
    }
    if (typeof data.spinnerTipsEnabled === "boolean") {
      result.spinnerTipsEnabled = data.spinnerTipsEnabled;
    }
    // Booleans that default ON: only an explicit `false` flips them.
    for (const [key, field] of [
      ["alwaysThinkingEnabled", "alwaysThinkingEnabled"],
      ["autoCompactEnabled", "autoCompactEnabled"],
      ["fileCheckpointingEnabled", "fileCheckpointingEnabled"],
      ["autoMemoryEnabled", "autoMemoryEnabled"],
      ["includeGitInstructions", "includeGitInstructions"],
    ] as const) {
      if (typeof data[key] === "boolean") result[field] = data[key] as boolean;
    }
    if (typeof data.verbose === "boolean") result.verbose = data.verbose;
    if (typeof data.outputStyle === "string") result.outputStyle = data.outputStyle;
    if (typeof data.editorMode === "string") result.editorMode = data.editorMode;
    if (typeof data.autoCompactWindow === "number" && data.autoCompactWindow > 0) {
      result.autoCompactWindow = data.autoCompactWindow;
    }
    const sandbox = data.sandbox as Record<string, unknown> | undefined;
    if (sandbox && typeof sandbox.enabled === "boolean") {
      result.sandboxEnabled = sandbox.enabled;
    }
    if (typeof data.cleanupPeriodDays === "number" && data.cleanupPeriodDays >= 0) {
      result.cleanupPeriodDays = data.cleanupPeriodDays;
    }
    // Accept any string — Claude CLI may introduce new effort tiers
    // without our needing a release to recognise them (the picker
    // surfaces unknown values alongside the built-in options).
    if (typeof data.effortLevel === "string") {
      result.effortLevel = data.effortLevel;
    }
    const permissions = data.permissions as Record<string, unknown> | undefined;
    if (permissions) {
      const mode = permissions.defaultMode;
      if (isPermissionDefaultMode(mode)) {
        result.defaultMode = mode;
      }
      if (typeof permissions.disableBypassPermissionsMode === "boolean") {
        result.disableBypassPermissionsMode = permissions.disableBypassPermissionsMode;
      }
      const dirs = permissions.additionalDirectories;
      if (Array.isArray(dirs)) {
        result.additionalDirectories = dirs.filter((d): d is string => typeof d === "string");
      }
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
 * The `availableModels` field is populated from the CLI bundle cache
 * (one-time 50ms scan, then instant) so it does not slow down re-parses.
 */
export function parseAccountData(workspacePath?: string): AccountData {
  // Saved profiles + the active match read here so the whole account
  // payload stays a single parse pass. No network, no token exposure
  // — profiles.ts returns metadata with a credentials hash, not the
  // token itself.
  const rawProfiles = listProfiles();
  const activeProfileSlug = getActiveProfileSlug(rawProfiles);
  // Attach each account's last-seen quota. Read once for the whole list
  // rather than per profile: it is a single small file, and the switcher
  // renders every row at the same instant anyway.
  const remembered = readQuotaHistory()?.accounts ?? {};
  const savedProfiles = rawProfiles.map((p) => ({
    ...p,
    lastQuota: (p.accountUuid && remembered[p.accountUuid]) || null,
  }));
  return {
    profile: parseProfile(),
    usage: parseUsage(),
    settings: parseSettings(),
    permissions: parsePermissions(workspacePath),
    availableModels: discoverModelsFromCli().map((m) => ({
      alias: m.alias,
      family: m.family,
      label: m.label,
      id: m.id,
      isLatest: m.isLatest,
    })),
    // Session-aware: with concurrent sessions on DIFFERENT models
    // (per-session /model overrides), the last statusline writer's
    // model is a coin flip — resolveActiveModel returns null then, so
    // the dropdown says "Default (auto)" instead of a wrong claim.
    activeModel: resolveActiveModel(readStatuslineCache(), Date.now()) || undefined,
    savedProfiles,
    activeProfileSlug,
    settingsSnapshots: listAllSnapshots(workspacePath),
    usageWarming: isUsageAggregateWarming(),
  };
}

// ── Writers ──

/**
 * Update a single key in settings.json, preserving other keys.
 * Supports nested keys with dot notation (e.g., "attribution.commit").
 */
/** Read a file, or null when it does not exist / cannot be read. */
function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** True for a JSON object — not null, not an array. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Read a settings file as the object a read-modify-write pass may edit.
 *
 * Returns `{}` when the file is absent or blank — nothing to lose, so
 * creating it is safe — and null when it exists but cannot be read as a
 * JSON object. Null means REFUSE: merging into a document we cannot
 * parse is impossible, and continuing with an empty object (what every
 * writer here used to do) replaces the user's file with whatever single
 * key the caller was setting.
 *
 * Claude Code skips a settings.json with comments, a trailing comma or
 * any truncation, so that state is both plausible and exactly where the
 * contents matter most.
 */
function readSettingsForWrite(filePath: string): Record<string, unknown> | null {
  const raw = readFileOrNull(filePath);
  if (raw === null || raw.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isPlainObject(parsed) ? parsed : null;
}

export function writeSettingsValue(
  key: string,
  value: unknown,
  scope: PermissionScope = "global",
  workspacePath?: string,
  /**
   * What an empty string means for this key.
   *
   * "remove" (the default) is right for almost everything: the UI clears a
   * field and the key goes away, restoring Claude Code's own behaviour.
   *
   * "value" is for the handful of keys where "" is itself an instruction.
   * `attribution.commit` / `attribution.pr` set to "" mean "add no
   * trailer", which is the opposite of the key being absent ("add the
   * default trailer"). Removing on empty made that state unreachable from
   * the UI, and silently destroyed it for anyone who already had it.
   */
  emptyString: "remove" | "value" = "remove",
): boolean {
  const filePath = resolveSettingsPath(scope, workspacePath);
  if (!filePath) return false;

  // Read and validate BEFORE touching anything.
  //
  // This used to swallow a parse failure and carry on with an empty
  // object, which meant the write replaced the whole file with the
  // single key being set. Claude Code rejects a settings.json containing
  // comments, a trailing comma or any truncation ("invalid JSON, JSON
  // comments, schema mismatch — the file is skipped"), so a file in
  // exactly that state is both plausible and the one where its contents
  // matter most to the user. A `{ model, env, permissions, hooks }` file
  // with one stray comment came back as `{ "verbose": true }`.
  //
  // Worse, it needed no user action: selfHealStatusline runs on every
  // activation once the tap is installed, and an unparseable file makes
  // readCommandFromFile report "no statusline", so the heal decided to
  // reinstall and rewrote the file. Open the editor, lose your settings.
  //
  // Refusing is the only safe answer. We cannot merge into a document we
  // cannot read, and we must not guess.
  const data = readSettingsForWrite(filePath);
  if (data === null) return false;

  const parts = key.split(".");
  let target: Record<string, unknown> = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const existing = target[k];
    if (existing === undefined) {
      target[k] = {};
    } else if (!isPlainObject(existing)) {
      // An intermediate that exists but is not an object — say
      // `permissions: ["Bash(ls)"]` from a hand-edit. Overwriting it with
      // `{}` to make room for the new leaf silently deleted whatever was
      // there; a permission allowlist is not something to drop in order
      // to store a default mode.
      return false;
    }
    target = target[k] as Record<string, unknown>;
  }

  // Snapshot only now that the write is known to be possible, so a
  // refused write does not churn the snapshot ring and push the user's
  // real history out of it.
  snapshotSettings(scope, filePath);

  const removeOnEmpty = emptyString === "remove";
  if (value === undefined || value === null || (value === "" && removeOnEmpty)) {
    delete target[parts[parts.length - 1]];
  } else {
    target[parts[parts.length - 1]] = value;
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, JSON.stringify(data, null, 2) + "\n");
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

  // Same refusal rule as writeSettingsValue: this used to swallow a parse
  // failure and write `{ permissions: { allow: [tool] } }` over the whole
  // file, so adding one allow rule to a settings.json with a stray
  // comment discarded everything else in it.
  const data = readSettingsForWrite(filePath);
  if (data === null) return false;

  if (data.permissions === undefined) data.permissions = {};
  if (!isPlainObject(data.permissions)) return false;
  const perms = data.permissions;
  if (perms[list] === undefined) perms[list] = [];
  // A non-array here would take the named property and lose it on
  // stringify — a silent no-op that reported success.
  if (!Array.isArray(perms[list])) return false;
  const arr = perms[list] as string[];
  if (!arr.includes(tool)) arr.push(tool);

  snapshotSettings(scope, filePath);

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, JSON.stringify(data, null, 2) + "\n");
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

  const data = readSettingsForWrite(filePath);
  if (data === null) return false;
  snapshotSettings(scope, filePath);

  const perms = data.permissions as Record<string, unknown> | undefined;
  if (!perms) return false;
  const arr = perms[list] as unknown;
  if (!Array.isArray(arr)) return false;
  const idx = arr.indexOf(tool);
  if (idx < 0) return false;
  arr.splice(idx, 1);

  try {
    writeFileAtomic(filePath, JSON.stringify(data, null, 2) + "\n");
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
  return claudeSettingsPath(scope, workspacePath);
}

/**
 * List settings snapshots for every scope reachable from the
 * current workspace. Each scope's list is independent so the UI can
 * group them; an unreachable scope (no workspace open) returns an
 * empty array.
 */
export function listAllSnapshots(workspacePath?: string): SettingsSnapshot[] {
  const scopes: PermissionScope[] = workspacePath
    ? ["global", "project", "local"]
    : ["global"];
  const all: SettingsSnapshot[] = [];
  for (const s of scopes) {
    const live = resolveSettingsPath(s, workspacePath);
    if (!live) continue;
    all.push(...listSnapshots(s, live));
  }
  // Newest first across the entire combined list keeps the UI simple
  // — one chronological feed instead of three buckets.
  return all.sort((a, b) => b.takenAtMs - a.takenAtMs);
}

/** Wrapper around `restoreSnapshot` that resolves the live file from scope. */
export function restoreSettingsSnapshot(
  scope: PermissionScope,
  snapshotId: string,
  workspacePath?: string,
): boolean {
  const filePath = resolveSettingsPath(scope, workspacePath);
  if (!filePath) return false;
  return restoreSnapshot(scope, filePath, snapshotId);
}

/** Wrapper around `deleteSnapshot` so callers don't import the snapshots module. */
export function deleteSettingsSnapshot(
  scope: PermissionScope,
  snapshotId: string,
): boolean {
  return deleteSnapshot(scope, snapshotId);
}

/**
 * Restore ~/.claude.json from its most recent valid backup. Called when
 * Claude CLI has left the primary config empty or truncated (a common
 * symptom of a crashed or disk-full write — see ~/.claude/backups/ for
 * Claude's own backup history).
 *
 * Returns the absolute path of the backup that was used on success, or
 * null if no valid backup could be located. Never throws.
 */
export function restoreClaudeJsonFromBackup(): string | null {
  try {
    const entries = fs.readdirSync(CLAUDE_BACKUPS_DIR);
    const backups = entries
      .filter((n) => /^\.claude\.json\.backup\.\d+$/.test(n))
      .map((n) => ({ name: n, ts: parseInt(n.split(".").pop() ?? "0", 10) }))
      .sort((a, b) => b.ts - a.ts);

    for (const b of backups) {
      const backupPath = path.join(CLAUDE_BACKUPS_DIR, b.name);
      try {
        const raw = fs.readFileSync(backupPath, "utf-8");
        if (!raw.trim()) continue;
        JSON.parse(raw); // validate it parses before overwriting
        writeFileAtomic(CLAUDE_JSON, raw);
        return backupPath;
      } catch {
        // this backup is also bad — try the next one
      }
    }
  } catch {
    // backups dir is missing
  }
  return null;
}
