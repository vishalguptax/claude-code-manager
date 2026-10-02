/**
 * Where Claude Code keeps its files, resolved the way Claude Code itself
 * resolves them. Pure Node.js — no VS Code dependency.
 *
 * Claude Code reads two environment variables that move its files:
 *
 *   - `CLAUDE_CONFIG_DIR` replaces `~/.claude` (sessions, settings, skills,
 *     agents, …) and moves the main config file from `~/.claude.json` to
 *     `<dir>/.claude.json`.
 *   - `CLAUDE_SECURESTORAGE_CONFIG_DIR` moves only the credential store
 *     (`.credentials.json` and the macOS Keychain item name).
 *   - `CLAUDE_CODE_CUSTOM_OAUTH_URL` (sign-in against an approved non-default
 *     OAuth server) renames the config file and the Keychain item with an
 *     `-custom-oauth` suffix, so the two logins never overwrite each other.
 *
 * The official Claude Code extension also sets `CLAUDE_CONFIG_DIR` for the
 * `claude` it runs from its own `claudeCode.environmentVariables` setting,
 * so a user can move the directory without touching their shell. Each
 * function below cites the Claude Code 2.1.287 code it mirrors.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * The values Claude Code would see for the variables that move its files.
 * Shaped as an environment block so it can be handed to a terminal as-is.
 */
export type ClaudeEnv = {
  CLAUDE_CONFIG_DIR?: string;
  CLAUDE_SECURESTORAGE_CONFIG_DIR?: string;
  CLAUDE_CODE_CUSTOM_OAUTH_URL?: string;
};

/** One `claudeCode.environmentVariables` entry, normalised. */
interface EnvEntry {
  name: string;
  value: string;
}

/**
 * Normalise the setting value the way the official extension does: an
 * array of `{ name, value }` (its declared shape) or a plain object map,
 * with a missing value read as "". Anything else contributes nothing.
 */
function settingEntries(setting: unknown): EnvEntry[] {
  const toValue = (v: unknown): string => (v == null ? "" : String(v));
  if (Array.isArray(setting)) {
    return setting
      .filter(
        (e): e is { name: string; value?: unknown } =>
          e != null && typeof e === "object" && typeof e.name === "string",
      )
      .map((e) => ({ name: e.name, value: toValue(e.value) }));
  }
  if (setting != null && typeof setting === "object") {
    return Object.entries(setting).map(([name, value]) => ({ name, value: toValue(value) }));
  }
  return [];
}

/**
 * The official extension applies a `CLAUDE_CONFIG_DIR` entry only when it is
 * an absolute path (its 2.1.287 changelog: "apply only when it is an
 * absolute path"). It does not expand `~`, so neither do we: reading
 * `~/x` as `$HOME/x` would point us at a folder its `claude` never writes.
 * On Windows a rooted path without a drive or UNC share is rejected too,
 * because it means "the current drive" and so depends on the cwd.
 */
function isAbsoluteConfigDir(value: string, platform: NodeJS.Platform): boolean {
  if (platform !== "win32") return path.posix.isAbsolute(value);
  return (
    path.win32.isAbsolute(value) &&
    /^([A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/]+[^\\/])/.test(value)
  );
}

/**
 * The environment Claude Code would run with, from the inherited
 * environment overlaid with the official extension's setting — the same
 * order its spawn uses: every setting entry overrides the inherited value,
 * and a `CLAUDE_CONFIG_DIR` entry overrides it only when absolute (the
 * last valid one wins). Windows environment names are case-insensitive.
 *
 * An empty inherited `CLAUDE_CONFIG_DIR` counts as unset: Claude Code
 * names its config file and Keychain item as if it were unset, and only
 * its directory lookup would read "" (as the process cwd). An empty
 * `CLAUDE_CODE_CUSTOM_OAUTH_URL` is unset too — the CLI tests it for truth.
 */
export function resolveClaudeEnv(
  env: NodeJS.ProcessEnv,
  setting: unknown,
  platform: NodeJS.Platform,
): ClaudeEnv {
  const sameName = (a: string, b: string): boolean =>
    platform === "win32" ? a.toUpperCase() === b : a === b;
  const resolved: ClaudeEnv = {};
  if (env.CLAUDE_CONFIG_DIR) resolved.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR;
  if (env.CLAUDE_SECURESTORAGE_CONFIG_DIR !== undefined) {
    resolved.CLAUDE_SECURESTORAGE_CONFIG_DIR = env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  }
  if (env.CLAUDE_CODE_CUSTOM_OAUTH_URL) {
    resolved.CLAUDE_CODE_CUSTOM_OAUTH_URL = env.CLAUDE_CODE_CUSTOM_OAUTH_URL;
  }
  for (const { name, value } of settingEntries(setting)) {
    if (sameName(name, "CLAUDE_CONFIG_DIR")) {
      if (isAbsoluteConfigDir(value, platform)) resolved.CLAUDE_CONFIG_DIR = value;
    } else if (sameName(name, "CLAUDE_SECURESTORAGE_CONFIG_DIR")) {
      resolved.CLAUDE_SECURESTORAGE_CONFIG_DIR = value;
    } else if (sameName(name, "CLAUDE_CODE_CUSTOM_OAUTH_URL")) {
      if (value) resolved.CLAUDE_CODE_CUSTOM_OAUTH_URL = value;
      else delete resolved.CLAUDE_CODE_CUSTOM_OAUTH_URL;
    }
  }
  return resolved;
}

/** True when two resolutions put Claude Code's files in the same places. */
export function sameClaudeEnv(a: ClaudeEnv, b: ClaudeEnv): boolean {
  return (
    a.CLAUDE_CONFIG_DIR === b.CLAUDE_CONFIG_DIR &&
    a.CLAUDE_SECURESTORAGE_CONFIG_DIR === b.CLAUDE_SECURESTORAGE_CONFIG_DIR &&
    a.CLAUDE_CODE_CUSTOM_OAUTH_URL === b.CLAUDE_CODE_CUSTOM_OAUTH_URL
  );
}

/**
 * Claude Code's config directory: `(CLAUDE_CONFIG_DIR ?? ~/.claude)`. The
 * default is returned exactly as before this module existed; a custom
 * directory is NFC-normalised as the CLI does, then made absolute so
 * siblings such as `<dir>.lock` never pick up a trailing separator.
 */
export function claudeConfigDir(env: ClaudeEnv, home: string): string {
  const custom = env.CLAUDE_CONFIG_DIR;
  return custom ? path.resolve(custom.normalize("NFC")) : path.join(home, ".claude");
}

/**
 * The OAuth-environment suffix in Claude Code's file and Keychain names.
 * Shipped builds pin the environment to "prod" (`function s(){return"prod"}`),
 * so the staging and local suffixes are unreachable and only
 * `CLAUDE_CODE_CUSTOM_OAUTH_URL` yields one.
 */
export function oauthFileSuffix(env: ClaudeEnv): string {
  return env.CLAUDE_CODE_CUSTOM_OAUTH_URL ? "-custom-oauth" : "";
}

/**
 * Claude Code's main config file. A legacy `<config dir>/.config.json` wins
 * whenever it exists — for the default ~/.claude too. Otherwise it is
 * `.claude<oauth suffix>.json` inside `CLAUDE_CONFIG_DIR` when set, else in
 * the home folder: `~/.claude.json` by default, but `<dir>/.claude.json`,
 * not `<dir>.json`, for a custom directory. The CLI makes this choice once
 * per process, as this module's callers do.
 */
export function claudeGlobalConfigFile(env: ClaudeEnv, home: string): string {
  const legacy = path.join(claudeConfigDir(env, home), ".config.json");
  if (fs.existsSync(legacy)) return legacy;
  return path.join(env.CLAUDE_CONFIG_DIR || home, `.claude${oauthFileSuffix(env)}.json`);
}

/**
 * The directory holding `.credentials.json`: `CLAUDE_SECURESTORAGE_CONFIG_DIR`
 * when defined (an empty value means `~/.claude`), else the config dir.
 */
export function claudeSecureStorageDir(env: ClaudeEnv, home: string): string {
  const secure = env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  if (secure === undefined) return claudeConfigDir(env, home);
  return path.resolve((secure || path.join(home, ".claude")).normalize("NFC"));
}

/**
 * macOS Keychain service name, mirroring the CLI's
 * `Claude Code${oauthSuffix}${kind}${dirSuffix}`. The directory suffix is
 * `-` plus the first 8 hex digits of the SHA-256 of the directory string
 * exactly as the CLI holds it — NFC-normalised but NOT resolved, so a
 * trailing slash changes the name, as it does for the CLI. There is no
 * suffix when the default directory is in use: `CLAUDE_CONFIG_DIR` unset
 * (or empty), or `CLAUDE_SECURESTORAGE_CONFIG_DIR` defined but empty.
 *
 * `kind` is `-credentials` for the current item and "" for the
 * suffix-less item v2.0.14 wrote.
 */
export function keychainServiceName(env: ClaudeEnv, kind: "-credentials" | ""): string {
  const secure = env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  const dir = secure !== undefined ? secure : env.CLAUDE_CONFIG_DIR;
  const suffix = dir
    ? `-${crypto.createHash("sha256").update(dir.normalize("NFC")).digest("hex").substring(0, 8)}`
    : "";
  return `Claude Code${oauthFileSuffix(env)}${kind}${suffix}`;
}

/**
 * Hand-off slot between the extension's entry bundle and its main bundle.
 * A registry symbol, not a module variable: the two bundles each carry
 * their own copy of this module, so only a process-wide slot is shared.
 * Not `process.env`: the extension host is shared with other extensions
 * (the official Claude Code one reads `CLAUDE_CONFIG_DIR` from it), so
 * writing there would change their behaviour.
 */
const HANDOFF = Symbol.for("claudeManager.claudeEnv");

/** Record the host-resolved environment for {@link publishedClaudeEnv}. */
export function publishClaudeEnv(env: ClaudeEnv): void {
  (globalThis as Record<symbol, unknown>)[HANDOFF] = env;
}

/**
 * The environment the extension host resolved, or the inherited process
 * environment when nothing was published — the case in the statusline and
 * session-start taps, which Claude Code spawns with its own environment.
 */
export function publishedClaudeEnv(): ClaudeEnv {
  const published = (globalThis as Record<symbol, unknown>)[HANDOFF];
  return (
    (published as ClaudeEnv | undefined) ??
    resolveClaudeEnv(process.env, undefined, process.platform)
  );
}
