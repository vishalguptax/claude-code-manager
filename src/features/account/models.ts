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
import * as os from "os";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execP = promisify(exec);

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
/** In-flight background scan, deduped so concurrent warms share one spawn. */
let warming: Promise<DiscoveredModel[]> | null = null;

/**
 * Resolve scannable Claude CLI files from a node_modules-shaped root.
 *
 * Looks for `@anthropic-ai/claude-code` under the given root and yields:
 *   - the legacy `cli.js` JS bundle (older versions), and
 *   - the native binary `claude[.exe]` inside the platform-specific
 *     nested package (`claude-code-win32-x64`, `claude-code-darwin-arm64`,
 *     ...). Both shapes contain model IDs as plaintext.
 *
 * Used to scan multiple install layouts (npm global root, native
 * installer's `~/.claude/local`, etc.) without duplicating logic.
 */
function collectFromNodeModulesRoot(root: string): string[] {
  const found: string[] = [];
  const pkgRoot = path.join(root, "@anthropic-ai", "claude-code");

  const legacy = path.join(pkgRoot, "cli.js");
  if (fs.existsSync(legacy)) found.push(legacy);

  const nested = path.join(pkgRoot, "node_modules", "@anthropic-ai");
  try {
    for (const entry of fs.readdirSync(nested)) {
      if (!entry.startsWith("claude-code-")) continue;
      for (const candidate of ["claude", "claude.exe"]) {
        const full = path.join(nested, entry, candidate);
        if (fs.existsSync(full)) found.push(full);
      }
    }
  } catch {
    // nested dir missing — caller falls through to next root
  }
  return found;
}

/**
 * Build the ordered list of candidate CLI files to scan for model IDs.
 *
 * Claude Code ships through several distribution channels and users on
 * different machines end up with the binary in different places:
 *
 *   1. **npm global** — `npm install -g @anthropic-ai/claude-code`. Files
 *      live under `npm root -g`. Some users have npm uninstalled or run
 *      it as a different user, so this can fail entirely.
 *   2. **Native installer** (`~/.claude/local`) — the curl-based
 *      installer and `claude migrate-installer` lay out a node_modules
 *      tree under `~/.claude/local/node_modules` that mirrors the npm
 *      shape. This is now the recommended install path and is what most
 *      machines that "show only Default + opus[1m]" actually have.
 *   3. **PATH** — whatever `claude` resolves to in the user's shell. We
 *      follow the realpath so a Homebrew shim, a `~/.local/bin` symlink,
 *      or a `claude.cmd` wrapper all lead back to the real binary.
 *
 * All candidates are scanned and results merged — different layouts can
 * coexist (e.g. an old npm global plus a fresh native install) and
 * shims may not contain every model string the real binary does.
 */
async function collectCliCandidates(): Promise<string[]> {
  const candidates: string[] = [];
  const home = os.homedir();

  // Native installer layout — most common case for the affected users.
  const localRoot = path.join(home, ".claude", "local");
  candidates.push(...collectFromNodeModulesRoot(path.join(localRoot, "node_modules")));
  for (const name of ["claude", "claude.exe"]) {
    const full = path.join(localRoot, name);
    if (fs.existsSync(full)) candidates.push(full);
  }

  // npm global root. Async shell `exec` so the spawn never blocks the
  // extension-host event loop; shell form resolves `npm.cmd` on Windows.
  try {
    const { stdout } = await execP("npm root -g", {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    });
    const globalRoot = stdout.trim();
    if (globalRoot) candidates.push(...collectFromNodeModulesRoot(globalRoot));
  } catch {
    // npm not installed or failed — skip
  }

  // PATH lookup with realpath resolution. `where` on Windows returns one
  // path per line; `command -v` on POSIX returns a single path.
  try {
    const cmd = process.platform === "win32" ? "where claude" : "command -v claude";
    const { stdout } = await execP(cmd, {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    });
    for (const line of stdout.trim().split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const real = fs.realpathSync(trimmed);
        if (fs.existsSync(real)) candidates.push(real);
      } catch {
        // unreadable / dangling — skip
      }
    }
  } catch {
    // not on PATH — skip
  }

  // Dedupe while preserving order.
  return [...new Set(candidates)];
}

/**
 * Discover available models from the installed Claude CLI package.
 *
 * Returns one entry per model family (opus, sonnet, haiku, ...) with the
 * latest version found. Results are cached for the lifetime of the
 * extension host process.
 *
 * Falls back to an empty array if the CLI isn't installed, the path
 * can't be resolved, or the file format changes. The dropdown handles
 * an empty list by surfacing only "Default" plus the user's currently
 * configured model — see `buildModelOptions` in account/webview/view.ts.
 */
export function discoverModelsFromCli(): DiscoveredModel[] {
  if (cache) return cache;
  // Non-blocking: never spawn on the caller's thread (parseAccountData runs
  // on the click path of ~19 settings handlers). Kick off the background
  // scan and return empty for now; the dropdown falls back to "Default" +
  // the current model until `warmModelCache` resolves and a fresh
  // accountData push carries the full list.
  void warmModelCache();
  return [];
}

/**
 * Scan one CLI file body for `claude-{family}-{major}[-{minor}]` model IDs,
 * folding hits into the shared `seen` map. Called once per candidate so each
 * (large — the native binary is ~236 MB) body can be freed before the next
 * read, keeping peak memory to a single file instead of all of them.
 */
function scanInto(content: string, seen: Map<string, DiscoveredModel>): void {
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

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const family = match[1].toLowerCase();
    const major = parseInt(match[2], 10);
    const minor = match[3] ? parseInt(match[3], 10) : 0;
    const versionNum = major * 1000 + minor;
    // Dedupe across (family, versionNum) — the binary contains both
    // "claude-opus-4" and "claude-opus-4-0" which are the same model.
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
      isLatest: false, // resolved by finalizeModels
    });
  }
}

/** Order newest-first and mark the newest of each family as the alias target. */
function finalizeModels(seen: Map<string, DiscoveredModel>): DiscoveredModel[] {
  // Sort newest to oldest across all families — the user scans the
  // dropdown top-down looking for the latest release regardless of
  // whether it's Opus, Sonnet, or Haiku. Family is the tiebreaker
  // for stable ordering when two models share a version number.
  const all = [...seen.values()].sort((a, b) => {
    if (a.versionNum !== b.versionNum) return b.versionNum - a.versionNum;
    return a.family.localeCompare(b.family);
  });

  const latestByFamily = new Set<string>();
  for (const m of all) {
    if (!latestByFamily.has(m.family)) {
      latestByFamily.add(m.family);
      m.isLatest = true;
    }
  }
  return all;
}

/**
 * Populate the model cache by scanning the installed CLI. Async — the
 * candidate-resolution spawns and file reads run off the event loop. Call
 * once at activation (and after a reload) so the cache is warm before the
 * account panel needs it. Concurrent calls share one in-flight scan.
 *
 * Reads and scans each candidate one at a time so the ~236 MB native binary
 * is never held in memory alongside the others.
 */
export async function warmModelCache(): Promise<DiscoveredModel[]> {
  if (cache) return cache;
  if (warming) return warming;
  warming = (async () => {
    const candidates = await collectCliCandidates();
    const seen = new Map<string, DiscoveredModel>();
    for (const cliPath of candidates) {
      try {
        // Read as latin1 so binary bytes round-trip as single-byte chars,
        // keeping the regex valid on both JS source and native binaries.
        scanInto(await fs.promises.readFile(cliPath, "latin1"), seen);
      } catch {
        // unreadable candidate — skip
      }
    }
    cache = finalizeModels(seen);
    warming = null;
    return cache;
  })();
  return warming;
}

/** Clear the cache so the next warm re-scans. Exposed for tests + reload. */
export function clearModelCache(): void {
  cache = null;
  warming = null;
}
