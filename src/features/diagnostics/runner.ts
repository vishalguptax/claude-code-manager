/**
 * Pre-flight diagnostics. Runs a battery of checks against the
 * filesystem + installed Claude CLI + workspace state and returns a
 * pass/fail report the UI can render directly.
 *
 * No vscode dependency on purpose — keeps the module unit-testable
 * with plain fs mocks. The vscode-specific parts (checking VS Code
 * version, workspace presence) live in commands.ts which adapts the
 * results before display.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { CLAUDE_DIR, STATS_CACHE_FILE } from "../../core/config";
import {
  readCredentials,
  probeKeychainStatus,
  isLoggedOut,
} from "../account/credentials";
import type { DiagnosticCheck, DiagnosticStatus } from "./types";

const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

const execP = promisify(exec);

/** A short-circuit constructor so each check stays a single expression. */
function check(
  id: string,
  label: string,
  status: DiagnosticStatus,
  detail: string,
  fixHint?: string,
): DiagnosticCheck {
  return { id, label, status, detail, fixHint };
}

function safeReadJson(filePath: string): unknown {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Try to invoke `claude --version` and return the trimmed stdout.
 * `null` on any failure — extracted so the check can also fall back
 * to a "not on PATH" message instead of swallowing the error.
 *
 * Async (shell `exec`, not `execSync`): the CLI can take several seconds
 * to answer on a cold start, and a synchronous spawn would freeze the
 * whole extension host — and every queued UI action — for that long.
 * Shell form is kept so Windows resolves the `claude.cmd`/`claude.ps1`
 * shim exactly as the previous `execSync` did.
 */
async function detectClaudeCliVersion(): Promise<string | null> {
  try {
    const { stdout } = await execP("claude --version", {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function checkClaudeCli(): Promise<DiagnosticCheck> {
  const version = await detectClaudeCliVersion();
  if (version) {
    return check("cli", "Claude CLI on PATH", "pass", version);
  }
  return check(
    "cli",
    "Claude CLI on PATH",
    "fail",
    "`claude --version` did not return.",
    "Install with `npm i -g @anthropic-ai/claude-code` or fix your PATH.",
  );
}

function checkClaudeDir(): DiagnosticCheck {
  try {
    fs.accessSync(CLAUDE_DIR, fs.constants.R_OK);
    return check("claudeDir", "~/.claude readable", "pass", CLAUDE_DIR);
  } catch {
    return check(
      "claudeDir",
      "~/.claude readable",
      "fail",
      `Cannot read ${CLAUDE_DIR}.`,
      "Run `claude` once so the CLI creates ~/.claude.",
    );
  }
}

function checkClaudeJson(): DiagnosticCheck {
  const data = safeReadJson(CLAUDE_JSON);
  if (!data || typeof data !== "object") {
    return check(
      "claudeJson",
      "~/.claude.json valid",
      "fail",
      "File missing or malformed JSON.",
      "Run `Claude Manager: Restore Claude config` or `claude` once.",
    );
  }
  if (!("oauthAccount" in (data as Record<string, unknown>))) {
    return check(
      "claudeJson",
      "~/.claude.json has oauthAccount",
      "warn",
      "Parsed JSON but no oauthAccount block — sign-in flow likely incomplete.",
      "Run `claude` and complete `/login`.",
    );
  }
  return check("claudeJson", "~/.claude.json valid", "pass", "oauthAccount present");
}

function checkCredentials(): DiagnosticCheck {
  const live = readCredentials();
  if (!live) {
    // Distinguish "no credentials anywhere" (signed out) from a
    // macOS-specific failure (Keychain locked, ACL denied, or
    // unreachable over SSH). Each maps to a different fix hint.
    if (process.platform === "darwin" && !isLoggedOut()) {
      const status = probeKeychainStatus();
      switch (status) {
        case "denied":
          return check(
            "credentials",
            "Keychain access",
            "fail",
            "Keychain refused to disclose the Claude Code credentials item (exit 51).",
            "Open Keychain Access → search for `Claude Code-credentials` → Access Control tab → add your IDE binary, then click Allow.",
          );
        case "locked":
          return check(
            "credentials",
            "Keychain access",
            "fail",
            "Default Keychain is locked.",
            "Run `security unlock-keychain` in Terminal, or unlock from Keychain Access.app.",
          );
        case "unreachable":
          return check(
            "credentials",
            "Keychain access",
            "fail",
            "Keychain is unreachable from this session (likely SSH or a headless context).",
            "Sign in directly on the machine, or set up a file-based fallback at ~/.claude/.credentials.json.",
          );
        case "error":
          return check(
            "credentials",
            "Keychain access",
            "fail",
            "`security` returned an unexpected error.",
            "Run `security find-generic-password -s 'Claude Code-credentials' -w` in Terminal to see the exact error.",
          );
        default:
          break;
      }
    }
    return check(
      "credentials",
      "credentials parse",
      "warn",
      "Credentials not found — only matters if you've run /login.",
    );
  }
  // Look for an expiresAt anywhere reasonable. Claude rotates the
  // shape over CLI versions; we just sniff for the field.
  const expiresAt = findExpiresAt(live.blob);
  const sourceLabel =
    live.source.kind === "keychain-darwin" ? "macOS Keychain" : "file";
  if (expiresAt === null) {
    return check(
      "credentials",
      "credentials parse",
      "pass",
      `Parsed (${sourceLabel}); no expiry stamp surfaced.`,
    );
  }
  if (expiresAt < Date.now()) {
    return check(
      "credentials",
      "OAuth token current",
      "warn",
      `Access token expired at ${new Date(expiresAt).toISOString()} (${sourceLabel}).`,
      "Run `claude` — the CLI will silently refresh the token on next start.",
    );
  }
  return check(
    "credentials",
    "OAuth token current",
    "pass",
    `Expires ${new Date(expiresAt).toISOString()} (${sourceLabel}).`,
  );
}

function findExpiresAt(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.expiresAt === "number") return obj.expiresAt;
  for (const v of Object.values(obj)) {
    const nested = findExpiresAt(v);
    if (nested !== null) return nested;
  }
  return null;
}

function checkStatsCache(): DiagnosticCheck {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(STATS_CACHE_FILE);
  } catch {
    return check(
      "statsCache",
      "stats-cache.json present",
      "warn",
      "Missing — Account → Usage will show empty until Claude rebuilds it.",
      "Use Claude for any session; the CLI re-aggregates on its own cadence.",
    );
  }
  const ageMs = Date.now() - stat.mtimeMs;
  const days = ageMs / 86_400_000;
  if (days > 7) {
    return check(
      "statsCache",
      "stats-cache.json fresh",
      "warn",
      `Last touched ${days.toFixed(1)} days ago.`,
      "Open a Claude session to nudge the CLI into re-aggregating.",
    );
  }
  return check(
    "statsCache",
    "stats-cache.json fresh",
    "pass",
    `Age ${days.toFixed(1)} days.`,
  );
}

/**
 * Check each path listed under `permissions.additionalDirectories`
 * exists + is readable. Skips silently when the key isn't set.
 */
function checkAdditionalDirectories(): DiagnosticCheck {
  const settings = safeReadJson(SETTINGS_FILE);
  const dirs = readAdditionalDirs(settings);
  if (dirs.length === 0) {
    return check(
      "additionalDirs",
      "additional directories",
      "pass",
      "None configured.",
    );
  }
  const broken: string[] = [];
  for (const d of dirs) {
    try {
      fs.accessSync(d, fs.constants.R_OK);
    } catch {
      broken.push(d);
    }
  }
  if (broken.length === 0) {
    return check(
      "additionalDirs",
      "additional directories readable",
      "pass",
      `${dirs.length} configured, all readable.`,
    );
  }
  return check(
    "additionalDirs",
    "additional directories readable",
    "fail",
    `Unreadable: ${broken.join(", ")}.`,
    "Remove the entry or fix the path under permissions.additionalDirectories.",
  );
}

function readAdditionalDirs(settings: unknown): string[] {
  if (!settings || typeof settings !== "object") return [];
  const perms = (settings as Record<string, unknown>).permissions;
  if (!perms || typeof perms !== "object") return [];
  const arr = (perms as Record<string, unknown>).additionalDirectories;
  if (!Array.isArray(arr)) return [];
  return arr.filter((s): s is string => typeof s === "string");
}

/**
 * Check that every absolute-path command referenced by a hook in
 * settings.json actually exists on disk. Relative commands and shell
 * builtins (no `/` or drive letter) are skipped — we have no
 * reliable way to resolve them.
 */
function checkHookPaths(): DiagnosticCheck {
  const settings = safeReadJson(SETTINGS_FILE);
  const cmds = collectHookCommands(settings);
  const absolutes = cmds.filter(isAbsolutePath);
  if (absolutes.length === 0) {
    return check(
      "hookPaths",
      "hook command paths",
      "pass",
      cmds.length === 0
        ? "No hooks configured."
        : `${cmds.length} hook command(s); none use absolute paths.`,
    );
  }
  const missing = absolutes.filter((c) => !fs.existsSync(extractCmdHead(c)));
  if (missing.length === 0) {
    return check(
      "hookPaths",
      "hook command paths",
      "pass",
      `${absolutes.length} absolute hook command(s), all present.`,
    );
  }
  return check(
    "hookPaths",
    "hook command paths",
    "fail",
    `Missing on disk: ${missing.map(extractCmdHead).join(", ")}.`,
    "Update settings.json hooks block — Claude won't invoke a missing path.",
  );
}

function collectHookCommands(settings: unknown): string[] {
  if (!settings || typeof settings !== "object") return [];
  const hooks = (settings as Record<string, unknown>).hooks;
  if (!hooks || typeof hooks !== "object") return [];
  const out: string[] = [];
  for (const list of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const inner = (entry as Record<string, unknown>).hooks;
      if (!Array.isArray(inner)) continue;
      for (const h of inner) {
        if (!h || typeof h !== "object") continue;
        const cmd = (h as Record<string, unknown>).command;
        if (typeof cmd === "string") out.push(cmd);
      }
    }
  }
  return out;
}

function isAbsolutePath(cmd: string): boolean {
  const head = extractCmdHead(cmd);
  return path.isAbsolute(head);
}

function extractCmdHead(cmd: string): string {
  // Take everything up to the first whitespace — that's typically
  // the command name. Quoted paths complicate this; the simple
  // strip-up-to-space heuristic is good enough for the diagnostic.
  const m = /^"([^"]+)"|^(\S+)/.exec(cmd.trim());
  return m ? m[1] ?? m[2] : cmd;
}

/**
 * Run every check and return them in display order. Async because the
 * Claude-CLI probe shells out; the remaining checks are fast synchronous
 * filesystem reads.
 */
export async function runDiagnostics(): Promise<DiagnosticCheck[]> {
  return [
    await checkClaudeCli(),
    checkClaudeDir(),
    checkClaudeJson(),
    checkCredentials(),
    checkStatsCache(),
    checkAdditionalDirectories(),
    checkHookPaths(),
  ];
}

export const __internals = {
  collectHookCommands,
  readAdditionalDirs,
  isAbsolutePath,
  extractCmdHead,
  findExpiresAt,
};
