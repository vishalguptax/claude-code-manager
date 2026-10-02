/**
 * Managed (policy) settings — the administrator's tier that outranks every
 * user, project and local settings file. Read-only: none of these sources
 * are ours to edit.
 *
 * Verified against the Claude Code 2.1.287 binary:
 *
 *  - Sources rank `remote > mdm > file`. `remote` is server-managed settings,
 *    cached at `~/.claude/remote-settings.json` as a plain settings object
 *    whose `$`-prefixed keys are metadata. `mdm` is the macOS managed
 *    preferences plist or, on Windows, the HKLM policy key. `file` is
 *    `managed-settings.json` in the platform policy dir plus its
 *    `managed-settings.d/` drop-ins.
 *  - The highest source that holds anything supplies the whole tier. Only
 *    when the winning source sets `managedSourcesBehavior: "merge"` are the
 *    lower sources merged beneath it (see {@link composeTiers}).
 *  - Drop-ins: every `*.json` entry that is a file or a symlink (dotfiles
 *    skipped), in bare `.sort()` order, each deep-merged over the last.
 *    Symlinks are followed, as the CLI does — the policy dir is admin-owned.
 *  - macOS plist: `/Library/Managed Preferences/<user>/com.anthropic.claudecode.plist`
 *    then `/Library/Managed Preferences/com.anthropic.claudecode.plist`; the
 *    first that holds settings wins. Read with
 *    `/usr/bin/plutil -convert json -o - -- <path>` (5 s timeout, 2 MiB cap).
 *  - Windows: `reg query HKLM\SOFTWARE\Policies\ClaudeCode /v Settings`, a
 *    REG_SZ / REG_EXPAND_SZ value holding the settings JSON.
 *
 *  - Windows HKCU: the same query against `HKCU\SOFTWARE\Policies\ClaudeCode`,
 *    ranked below the file tier. It is user-writable, so it applies only when
 *    no admin source (remote / mdm / file) holds anything, and never merges
 *    into one.
 *  - The CLI resolves the OS policy sources (plist / registry) once at
 *    startup. They are cached here for the extension host's lifetime too —
 *    spawning plutil or reg.exe on every tab refresh would cost a process
 *    each time — and dropped by the global Reload
 *    ({@link clearOsPolicyCache}). The file sources are re-read every time.
 *
 * Not modelled: the CLI's per-key "most restrictive value wins" floors except
 * for the two sync opt-outs this extension reads, and policy helpers.
 *
 * Pure Node.js — no VS Code dependency.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CLAUDE_DIR } from "./config";
import { asObject, readJsonObject } from "./jsonFile";

/** Server-managed settings, as Claude Code caches them on disk. */
export const REMOTE_SETTINGS_FILE: string = path.join(CLAUDE_DIR, "remote-settings.json");

/** The CLI's limits for a policy read (`ztr` / `R9o` in the binary). */
const POLICY_MAX_BYTES = 2 * 1024 * 1024;
const POLICY_TIMEOUT_MS = 5000;

/** The platform's policy directory — where Claude Code looks for managed-settings.json. */
export function managedSettingsDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === "darwin") return "/Library/Application Support/ClaudeCode";
  if (platform === "win32") return "C:\\Program Files\\ClaudeCode";
  return "/etc/claude-code";
}

/** The base policy file inside {@link managedSettingsDir}. */
export function managedSettingsPath(platform: NodeJS.Platform = process.platform): string {
  return path.join(managedSettingsDir(platform), "managed-settings.json");
}

/** One policy source as read: its settings (null when it holds none), where, and problems. */
export interface PolicySourceRead {
  settings: Record<string, unknown> | null;
  /** The file (or registry value) to name for this source. */
  source: string;
  errors: string[];
}

/** The managed tier as Claude Code would apply it, named after its winning source. */
export type ManagedSettingsRead = PolicySourceRead;

/** Where each source is read from. Defaults are the real locations; tests swap them. */
export interface ManagedSources {
  dir: string;
  remoteFile: string;
  /** The mdm source (plist / HKLM) for this platform. */
  readMdm: () => PolicySourceRead;
  /** The user-writable HKCU source (Windows only). */
  readHkcu: () => PolicySourceRead;
}

// ── Merging ──────────────────────────────────────────────────────────────────

/** Keys whose objects merge one level deep instead of recursively. */
const SHALLOW_MERGE_KEYS = new Set(["extraKnownMarketplaces", "managedMcpServers"]);

/**
 * Allowlist-style keys a higher source REPLACES rather than unions with when
 * sources merge (`cc` in the binary): unioning two allowlists would widen
 * both.
 */
const REPLACE_ON_MERGE_KEYS = new Set([
  "allowedMcpServers",
  "availableModels",
  "strictKnownMarketplaces",
  "allowedChannelPlugins",
  "allowedProviders",
]);

/**
 * Keys a lower source may not contribute under `"merge"` (`Qns`): the
 * winning source alone decides them.
 */
const TOP_ONLY_PATHS: readonly (readonly string[])[] = [
  ["permissions", "defaultMode"],
  ["modelPicker", "replaceBuiltInOptions"],
];

/**
 * "Most restrictive wins" keys this extension reads. Under `"merge"` the CLI
 * keeps the most restrictive value any source sets; for these two that is
 * `false`.
 */
const RESTRICT_TO_FALSE_KEYS = ["syncClaudeAiSkills", "syncClaudeAiPlugins"] as const;

/**
 * Deep-merge `next` over `base`: objects merge key by key, a later scalar
 * wins, arrays concatenate without duplicates, and the
 * {@link SHALLOW_MERGE_KEYS} merge one level deep. `replaceKeys` names keys
 * whose later value replaces outright. Returns a new object.
 */
export function mergeManagedLayer(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
  replaceKeys: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(next)) {
    const prev = out[key];
    if (replaceKeys.has(key)) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(prev) && Array.isArray(value)) {
      out[key] = [...new Set([...prev, ...value])];
      continue;
    }
    const prevObj = asObject(prev);
    const nextObj = asObject(value);
    if (prevObj && nextObj) {
      out[key] = SHALLOW_MERGE_KEYS.has(key)
        ? { ...prevObj, ...nextObj }
        : mergeManagedLayer(prevObj, nextObj);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** A copy of `settings` without the {@link TOP_ONLY_PATHS}. */
function withoutTopOnly(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...settings };
  for (const [parent, child] of TOP_ONLY_PATHS) {
    const obj = asObject(out[parent]);
    if (!obj || !(child in obj)) continue;
    const { [child]: _dropped, ...rest } = obj;
    out[parent] = rest;
  }
  return out;
}

/**
 * Compose the present sources, highest first, into the tier Claude Code
 * applies (`H_` in the binary).
 *
 * Without `managedSourcesBehavior: "merge"` on the winning source, the
 * winner is the whole tier. With it, the lower sources are merged lowest
 * first (minus the {@link TOP_ONLY_PATHS}, allowlists replaced rather than
 * unioned), the winner is merged on top, and a `false` sync opt-out from any
 * source survives.
 */
export function composeTiers(tiers: Record<string, unknown>[]): Record<string, unknown> | null {
  const [top, ...lower] = tiers;
  if (!top) return null;
  const { managedSourcesBehavior, ...winner } = top;
  if (managedSourcesBehavior !== "merge" || lower.length === 0) return winner;

  let merged: Record<string, unknown> = {};
  for (const tier of [...lower].reverse()) {
    merged = mergeManagedLayer(merged, withoutTopOnly(tier), REPLACE_ON_MERGE_KEYS);
  }
  merged = mergeManagedLayer(merged, winner, REPLACE_ON_MERGE_KEYS);
  for (const key of RESTRICT_TO_FALSE_KEYS) {
    if (tiers.some((t) => t[key] === false)) merged[key] = false;
  }
  return merged;
}

// ── Sources ──────────────────────────────────────────────────────────────────

/** The sentence an unusable policy source gets. */
function unusable(source: string, reason: string): string {
  return `${source} could not be read (${reason}), so the policy it sets is not shown here.`;
}

/** A settings object with `$` metadata keys removed, or null when nothing is left. */
function withoutMetadata(data: Record<string, unknown>): Record<string, unknown> | null {
  const entries = Object.entries(data).filter(([k]) => !k.startsWith("$"));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/** Parse policy JSON text, or explain why it is not a settings object. */
function parsePolicy(text: string): { data: Record<string, unknown> } | { reason: string } {
  if (text.trim() === "") return { data: {} };
  try {
    const data = asObject(JSON.parse(text));
    return data ? { data } : { reason: "not a JSON object" };
  } catch (err) {
    return { reason: (err as Error).message };
  }
}

/**
 * Read one policy file, following a symlink (the CLI does; the policy dir is
 * admin-owned). Absent → null with no error.
 */
function readPolicyFile(file: string, errors: string[]): Record<string, unknown> | null {
  let text: string;
  try {
    if (fs.statSync(file).size > POLICY_MAX_BYTES) {
      errors.push(unusable(file, `larger than ${POLICY_MAX_BYTES} bytes`));
      return null;
    }
    text = fs.readFileSync(file, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") errors.push(unusable(file, (err as Error).message));
    return null;
  }
  const parsed = parsePolicy(text);
  if ("reason" in parsed) {
    errors.push(unusable(file, parsed.reason));
    return null;
  }
  return Object.keys(parsed.data).length > 0 ? parsed.data : null;
}

/** Server-managed settings, or null when the cache holds none. */
function readRemote(filePath: string): PolicySourceRead {
  const errors: string[] = [];
  const res = readJsonObject(filePath);
  if (res.kind === "invalid") errors.push(unusable(filePath, res.reason));
  return { settings: res.kind === "ok" ? withoutMetadata(res.data) : null, source: filePath, errors };
}

/** managed-settings.json, then the sorted drop-ins, merged in order. */
function readFileTier(dir: string): PolicySourceRead {
  const errors: string[] = [];
  const base = path.join(dir, "managed-settings.json");
  const files = [base];
  const dropInDir = path.join(dir, "managed-settings.d");
  try {
    files.push(
      ...fs
        .readdirSync(dropInDir, { withFileTypes: true })
        .filter((e) => (e.isFile() || e.isSymbolicLink()) && e.name.endsWith(".json"))
        .filter((e) => !e.name.startsWith("."))
        .map((e) => e.name)
        // Code-unit order, like the CLI's bare `.sort()` — not localeCompare,
        // which would rank `B.json` after `a.json` and flip a precedence.
        .sort()
        .map((name) => path.join(dropInDir, name)),
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      errors.push(unusable(dropInDir, (err as Error).message));
    }
  }

  let merged: Record<string, unknown> | null = null;
  for (const file of files) {
    const data = readPolicyFile(file, errors);
    if (data) merged = mergeManagedLayer(merged ?? {}, data);
  }
  return { settings: merged, source: base, errors };
}

/** Runs a policy reader binary (plutil / reg.exe). A seam so tests never spawn one. */
export type PolicyToolRunner = (
  file: string,
  args: string[],
) => { ok: true; stdout: string } | { ok: false; reason: string };

/** Run a policy reader binary with the CLI's limits, argv only (no shell). Never throws. */
const runPolicyTool: PolicyToolRunner = (file, args) => {
  try {
    const stdout = execFileSync(file, args, {
      encoding: "utf-8",
      timeout: POLICY_TIMEOUT_MS,
      maxBuffer: POLICY_MAX_BYTES,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
};

/** The managed-preferences plists the CLI reads, highest first. */
export function managedPlistPaths(username: string): string[] {
  const domain = "com.anthropic.claudecode.plist";
  const out: string[] = [];
  if (username !== "") out.push(`/Library/Managed Preferences/${username}/${domain}`);
  out.push(`/Library/Managed Preferences/${domain}`);
  return out;
}

/** macOS: the first managed-preferences plist that holds settings. */
export function readMacPlist(
  paths: string[] = managedPlistPaths(safeUsername()),
  run: PolicyToolRunner = runPolicyTool,
): PolicySourceRead {
  const errors: string[] = [];
  for (const plist of paths) {
    try {
      fs.accessSync(plist, fs.constants.R_OK);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") errors.push(unusable(plist, (err as Error).message));
      continue;
    }
    const res = run("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", plist]);
    if (!res.ok) {
      errors.push(unusable(plist, "plutil could not convert it to JSON"));
      continue;
    }
    const parsed = parsePolicy(res.stdout);
    if ("reason" in parsed) {
      errors.push(unusable(plist, parsed.reason));
      continue;
    }
    if (Object.keys(parsed.data).length > 0) return { settings: parsed.data, source: plist, errors };
  }
  return { settings: null, source: paths[paths.length - 1] ?? "", errors };
}

/** The registry policy keys the CLI reads: the admin one, then the user-writable one. */
export const HKLM_POLICY_KEY = "HKLM\\SOFTWARE\\Policies\\ClaudeCode";
export const HKCU_POLICY_KEY = "HKCU\\SOFTWARE\\Policies\\ClaudeCode";

/** Extract the `Settings` REG_SZ value from `reg query` output (`xt` in the binary). */
export function parseRegQuery(stdout: string): string | null {
  const match = stdout.match(/^[ \t]+Settings[ \t]+REG_(?:EXPAND_)?SZ[ \t]+([\s\S]*)/im);
  const value = match?.[1]?.trimEnd();
  return value ? value : null;
}

/**
 * Windows: one registry policy value. Anything short of a readable value —
 * no key, no reg.exe, a timeout — reads as absent: this view is advisory,
 * and inventing a policy from a failed read would be worse than showing none.
 */
export function readWindowsRegistry(
  key: string = HKLM_POLICY_KEY,
  run: PolicyToolRunner = runPolicyTool,
): PolicySourceRead {
  const source = `Registry: ${key}\\Settings`;
  // reg.exe by absolute path, so a `reg` earlier on PATH is never what runs.
  const reg = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
  const res = run(reg, ["query", key, "/v", "Settings"]);
  const value = res.ok ? parseRegQuery(res.stdout) : null;
  if (value === null) return { settings: null, source, errors: [] };
  const parsed = parsePolicy(value);
  if ("reason" in parsed) return { settings: null, source, errors: [unusable(source, parsed.reason)] };
  return {
    settings: Object.keys(parsed.data).length > 0 ? parsed.data : null,
    source,
    errors: [],
  };
}

function safeUsername(): string {
  try {
    return os.userInfo().username;
  } catch {
    return "";
  }
}

const NONE: PolicySourceRead = { settings: null, source: "", errors: [] };

/** OS policy sources, read once per extension-host lifetime (see the header). */
let osPolicyCache: { mdm: PolicySourceRead; hkcu: PolicySourceRead } | null = null;

function osPolicy(): { mdm: PolicySourceRead; hkcu: PolicySourceRead } {
  osPolicyCache ??= {
    mdm:
      process.platform === "darwin"
        ? readMacPlist()
        : process.platform === "win32"
          ? readWindowsRegistry(HKLM_POLICY_KEY)
          : NONE,
    hkcu: process.platform === "win32" ? readWindowsRegistry(HKCU_POLICY_KEY) : NONE,
  };
  return osPolicyCache;
}

/** Forget the OS policy sources so the next read re-queries them. Called by the global Reload. */
export function clearOsPolicyCache(): void {
  osPolicyCache = null;
}

/**
 * Read the managed tier. Every source defaults to its real location; tests
 * pass a temp tree and stub OS readers.
 */
export function readManagedSettings(sources: Partial<ManagedSources> = {}): ManagedSettingsRead {
  const admin = [
    readRemote(sources.remoteFile ?? REMOTE_SETTINGS_FILE),
    (sources.readMdm ?? (() => osPolicy().mdm))(),
    readFileTier(sources.dir ?? managedSettingsDir()),
  ];
  const hkcu = (sources.readHkcu ?? (() => osPolicy().hkcu))();
  const errors = [...admin, hkcu].flatMap((r) => r.errors);
  const present = admin.filter(
    (r): r is PolicySourceRead & { settings: Record<string, unknown> } => r.settings !== null,
  );
  if (present.length === 0 && hkcu.settings !== null) {
    // Only when no admin source exists, and on its own: it is the user's.
    return { settings: composeTiers([hkcu.settings]), source: hkcu.source, errors };
  }
  return {
    settings: composeTiers(present.map((r) => r.settings)),
    // The winner names the tier; with nothing in force, the documented entry point.
    source: present[0]?.source ?? (admin[2] as PolicySourceRead).source,
    errors,
  };
}
