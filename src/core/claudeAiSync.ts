/**
 * claude.ai sync — the skills and plugins Claude Code downloads from the
 * signed-in claude.ai account into
 *   `~/.claude/skills/synced/<bucket>/`  and  `~/.claude/plugins/synced/<bucket>/`.
 *
 * Verified against the Claude Code 2.1.287 binary and a real tree:
 *
 *  - One bucket per account ever signed in on this machine, named
 *    `<orgUuid>_<accountUuid>`, both lowercased. Claude Code loads ONLY the
 *    bucket of the account signed in now; the others are left on disk for
 *    when you switch back. Listing every bucket shows each skill once per
 *    account that ever synced it.
 *  - For a stored claude.ai login the org comes from
 *    `CLAUDE_CODE_ORGANIZATION_UUID` when set, else
 *    `oauthAccount.organizationUuid` in ~/.claude.json; the account is always
 *    `oauthAccount.accountUuid`. Either missing or not a UUID → no bucket, and
 *    nothing synced is loaded.
 *  - `syncClaudeAiSkills` / `syncClaudeAiPlugins`: "only false is honored",
 *    read from user settings or managed settings, never from project settings.
 *    Off → previously synced items "are hidden from every session started
 *    afterwards", so they are not active and must not be listed as such.
 *  - Edits to synced files are not sent back to the account and are replaced
 *    on the next sync round, so every synced item is read-only here.
 *
 * Pure Node.js — no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import { CLAUDE_JSON_FILE, SETTINGS_FILE } from "./config";
import { asObject, readJsonObject } from "./jsonFile";
import { readManagedSettings } from "./managedSettings";

/** Directory name Claude Code reserves under skills/ and plugins/ for synced content. */
export const SYNCED_DIR_NAME = "synced";

const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** A UUID string, or null for anything else (the CLI drops non-UUIDs the same way). */
function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

/**
 * The bucket directory name of the signed-in claude.ai account, or null when
 * no claude.ai account is signed in.
 */
export function activeSyncBucket(
  claudeJsonFile: string = CLAUDE_JSON_FILE,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  // A plain read, not the no-follow one: ~/.claude.json is the user's own
  // config, and dotfile managers commonly symlink it.
  let account: Record<string, unknown> | null;
  try {
    account = asObject(asObject(JSON.parse(fs.readFileSync(claudeJsonFile, "utf-8")))?.oauthAccount);
  } catch {
    return null;
  }
  if (!account) return null;
  const org = uuidOrNull(env.CLAUDE_CODE_ORGANIZATION_UUID ?? account.organizationUuid);
  const user = uuidOrNull(account.accountUuid);
  return org && user ? `${org.toLowerCase()}_${user.toLowerCase()}` : null;
}

/**
 * The directory name Claude Code gives a synced item: path separators and
 * Windows-reserved characters become `_`, trailing dots/spaces are dropped,
 * and a re-downloaded generation N > 1 lands in `<name>~g<N>` beside the old
 * one. Null when nothing usable is left — which is also what keeps `..` from
 * escaping the bucket.
 */
export function syncedDirName(name: string, generation?: unknown): string | null {
  const base = name.replace(/[<>:"|?*\\/]/g, "_").replace(/[. ]+$/, "");
  if (base === "") return null;
  return typeof generation === "number" && Number.isInteger(generation) && generation > 1
    ? `${base}~g${generation}`
    : base;
}

/** Which synced content an opt-out applies to. */
export type SyncedKind = "skills" | "plugins";

const OPT_OUT_KEY: Record<SyncedKind, string> = {
  skills: "syncClaudeAiSkills",
  plugins: "syncClaudeAiPlugins",
};

/**
 * Whether Claude Code loads synced content of `kind`: false when user or
 * managed settings set the opt-out key to `false`.
 */
export function claudeAiSyncEnabled(
  kind: SyncedKind,
  userSettingsFile: string = SETTINGS_FILE,
  managed: Record<string, unknown> | null = readManagedSettings().settings,
): boolean {
  const key = OPT_OUT_KEY[kind];
  const user = readJsonObject(userSettingsFile);
  if (user.kind === "ok" && user.data[key] === false) return false;
  return managed?.[key] !== false;
}

/**
 * The active account's bucket directory under `syncedRoot`
 * (`~/.claude/skills/synced` or `~/.claude/plugins/synced`), or null when
 * Claude Code would load nothing from it: nobody is signed in to claude.ai,
 * or the user or their organisation turned that kind of sync off.
 */
export function activeSyncedDir(syncedRoot: string, kind: SyncedKind): string | null {
  if (!claudeAiSyncEnabled(kind)) return null;
  const bucket = activeSyncBucket();
  return bucket === null ? null : path.join(syncedRoot, bucket);
}
