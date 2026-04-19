/**
 * Dynamic model discovery from the locally installed Claude CLI.
 *
 * Claude CLI ships model IDs as string literals embedded in either a JS
 * bundle (older versions) or a native binary (current versions since they
 * migrated to platform-specific packages like claude-code-win32-x64). In
 * both cases the model IDs survive as plaintext strings — we scan for
 * `claude-{family}-{major}-{minor}` patterns and pick the latest version
 * per family. When the user upgrades the CLI, the next VS Code session
 * picks up the new models automatically.
 *
 * The scan is ~100ms for a 20MB file and is cached for the session.
 */
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

/** A discovered model with its family and version. */
export interface DiscoveredModel {
  /** Short alias usable in settings, e.g. "opus" */
  alias: string;
  /** Full model ID, e.g. "claude-opus-4-7" */
  id: string;
  /** Display label, e.g. "Opus 4.7" */
  label: string;
  /** Family name ("opus", "sonnet", "haiku", ...) for grouping */
  family: string;
  /** Numeric sort key for ordering (higher = newer) */
  versionNum: number;
  /**
   * True if this is the newest version of its family. Latest versions
   * map to the alias form (e.g. "opus") which Claude resolves to the
   * current newest automatically; older versions map to the full ID
   * (e.g. "claude-opus-4-6") so the user is pinned to that version.
   */
  isLatest: boolean;
}

let cache: DiscoveredModel[] | null = null;

/**
 * Resolve the path to the Claude CLI file we can scan for model IDs.
 *
 * Tries both the legacy JS bundle path (cli.js at the package root) and
 * the current native-binary path (claude[.exe] inside the platform
 * subpackage like claude-code-win32-x64). Returns the first one found.
 * Callers should treat a null return as "not installed — use fallback".
 */
function resolveCliBinaryPath(globalRoot: string): string | null {
  const pkgRoot = path.join(globalRoot, "@anthropic-ai", "claude-code");

  // Legacy: single cli.js at package root
  const legacy = path.join(pkgRoot, "cli.js");
  if (fs.existsSync(legacy)) return legacy;

  // Current: native binary under platform-specific nested package
  const nested = path.join(pkgRoot, "node_modules", "@anthropic-ai");
  try {
    for (const entry of fs.readdirSync(nested)) {
      if (!entry.startsWith("claude-code-")) continue;
      for (const candidate of ["claude", "claude.exe"]) {
        const full = path.join(nested, entry, candidate);
        if (fs.existsSync(full)) return full;
      }
    }
  } catch {
    // nested dir missing — fall through to null
  }
  return null;
}

/**
 * Discover available models from the installed Claude CLI package.
 *
 * Returns one entry per model family (opus, sonnet, haiku, ...) with the
 * latest version found. Results are cached for the lifetime of the
 * extension host process.
 *
 * Falls back to an empty array if the CLI isn't installed, the path
 * can't be resolved, or the file format changes. Callers should always
 * merge the result with a hardcoded fallback so the dropdown is never
 * empty.
 */
export function discoverModelsFromCli(): DiscoveredModel[] {
  if (cache) return cache;

  try {
    const globalRoot = execSync("npm root -g", {
      encoding: "utf-8",
      timeout: 5000,
      // Suppress stderr (npm warnings about missing package.json)
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    const cliPath = resolveCliBinaryPath(globalRoot);
    if (!cliPath) {
      cache = [];
      return cache;
    }

    // Read as latin1 so binary bytes round-trip as single-byte chars,
    // keeping our regex matching valid on both JS source and native
    // binaries (where model IDs are embedded as plain ASCII strings).
    const content = fs.readFileSync(cliPath, "latin1");
    // Match the simple version form, no surrounding quotes required so
    // this works on both JS bundles ("claude-opus-4-7") and native
    // binaries (claude-opus-4-7 as a null-terminated string):
    //   claude-{family}-{major}           (e.g. claude-opus-4)
    //   claude-{family}-{major}-{minor}   (e.g. claude-opus-4-7)
    // where minor is 1-2 digits so we reject date-versioned snapshots
    // like claude-opus-4-20250514 (8-digit date would pose as a huge
    // minor version). Word boundary \b on the trailing side ensures we
    // stop at the correct digit group even without string delimiters.
    const regex = /\bclaude-(opus|sonnet|haiku|flash|turbo|nano)-(\d{1,2})(?:-(\d{1,2}))?\b/gi;

    // Dedupe across (family, versionNum) — the binary contains both
    // "claude-opus-4" and "claude-opus-4-0" which are the same model
    // at versionNum 4000. Keep one entry per (family, version) pair.
    const seen = new Map<string, DiscoveredModel>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const family = match[1].toLowerCase();
      const major = parseInt(match[2], 10);
      const minor = match[3] ? parseInt(match[3], 10) : 0;
      const versionNum = major * 1000 + minor;
      const key = `${family}:${versionNum}`;
      if (seen.has(key)) continue;

      const versionStr = minor > 0 ? `${major}.${minor}` : `${major}`;
      const id = minor > 0
        ? `claude-${family}-${major}-${minor}`
        : `claude-${family}-${major}`;
      const displayName = family.charAt(0).toUpperCase() + family.slice(1);
      seen.set(key, {
        alias: family,
        id,
        label: `${displayName} ${versionStr}`,
        family,
        versionNum,
        isLatest: false, // resolved in a second pass below
      });
    }

    // Sort newest to oldest across all families — the user scans the
    // dropdown top-down looking for the latest release regardless of
    // whether it's Opus, Sonnet, or Haiku. Family is the tiebreaker
    // for stable ordering when two models share a version number.
    const all = [...seen.values()].sort((a, b) => {
      if (a.versionNum !== b.versionNum) return b.versionNum - a.versionNum;
      return a.family.localeCompare(b.family);
    });

    // Mark the newest of each family as the alias target.
    const latestByFamily = new Map<string, number>();
    for (const m of all) {
      if (!latestByFamily.has(m.family)) {
        latestByFamily.set(m.family, m.versionNum);
        m.isLatest = true;
      }
    }

    cache = all;
  } catch {
    cache = [];
  }

  return cache;
}

/** Clear the cache so the next call re-scans. Exposed for tests. */
export function clearModelCache(): void {
  cache = null;
}
