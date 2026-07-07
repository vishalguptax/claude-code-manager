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
 * Fingerprints of the CLI files the last scan read. A CLI upgrade
 * replaces the binary in place; comparing mtime+size against these is
 * how `revalidateModelCache` notices new models mid-session without
 * paying the 236 MB re-scan on every check.
 */
let scannedCandidates: Array<{ path: string; mtimeMs: number; size: number }> = [];

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

  // Dedupe by REALPATH, preserving order. The same physical binary is
  // often reachable two ways — the node_modules layout path and the
  // PATH lookup (`command -v claude` → realpath) — and each scan reads
  // + regexes the full ~236 MB. Collapsing on the resolved target means
  // that binary is read once, not twice. Fall back to the raw path when
  // realpath fails (dangling/permission) so a candidate is never lost.
  const seenReal = new Set<string>();
  const deduped: string[] = [];
  for (const c of candidates) {
    let key = c;
    try {
      key = fs.realpathSync(c);
    } catch {
      // keep the raw path as its own key
    }
    if (seenReal.has(key)) continue;
    seenReal.add(key);
    deduped.push(c);
  }
  return deduped;
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
 * Scan one text slice for `claude-{family}-{major}[-{minor}]` model IDs,
 * folding hits into the shared `seen` map. Called once per streamed chunk by
 * {@link scanFileInto}; `seen` dedupes across chunks and candidates so the
 * inter-chunk overlap never double-counts.
 */
/**
 * Strings that fit the claude-{word}-{digit} shape but are not model
 * families. "code" guards against the CLI's own package name (e.g.
 * "claude-code-2..."); "instant" is the ancient claude-instant line
 * whose IDs still linger in the binary.
 */
const NON_MODEL_FAMILIES = new Set(["code", "instant"]);

function scanInto(content: string, seen: Map<string, DiscoveredModel>): void {
  // Match the simple version form, no surrounding quotes required so
  // this works on both JS bundles ("claude-opus-4-7") and native
  // binaries (claude-opus-4-7 as a null-terminated string):
  //   claude-{family}-{major}           (e.g. claude-opus-4)
  //   claude-{family}-{major}-{minor}   (e.g. claude-opus-4-7)
  // The family is any word, not a hardcoded list — a new family
  // (fable, mythos, ...) must appear in the dropdown without a
  // release of this extension. NON_MODEL_FAMILIES filters the known
  // lookalikes. Minor is 1-2 digits so we reject date-versioned
  // snapshots like claude-opus-4-20250514 (8-digit date would pose
  // as a huge minor version). Word boundary \b on the trailing side
  // ensures we stop at the correct digit group even without string
  // delimiters.
  const regex = /\bclaude-([a-z]{3,12})-(\d{1,2})(?:-(\d{1,2}))?\b/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const family = match[1].toLowerCase();
    if (NON_MODEL_FAMILIES.has(family)) continue;
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

/** Chunk size for the streaming binary scan. */
const SCAN_CHUNK_BYTES = 4 * 1024 * 1024;
/**
 * Overlap carried between chunks so a model ID straddling a chunk boundary is
 * still matched in the next pass. The longest ID is ~25 chars
 * ("claude-{12-char family}-99-99"); 64 is a comfortable margin. scanInto
 * dedupes by (family, versionNum), so re-seeing a match in the overlap can
 * never double-count.
 */
const SCAN_OVERLAP_CHARS = 64;

/**
 * Read + scan one candidate CLI file in bounded chunks, folding model-ID hits
 * into `seen`. Streaming (rather than a single `readFile`) keeps peak memory to
 * one chunk instead of the whole ~236 MB binary, and — critically — the
 * `setImmediate` yield between chunks hands the event loop back so queued
 * webview messages (getAccountData, quotaData, the Config panel's reads) are
 * not starved while a large binary is regex-scanned. Doing the scan in one
 * synchronous pass blocked the host for minutes, leaving the Account/Config
 * panels stuck on their loading skeletons.
 */
async function scanFileInto(
  filePath: string,
  seen: Map<string, DiscoveredModel>,
): Promise<void> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buf = Buffer.allocUnsafe(SCAN_CHUNK_BYTES);
    let carry = "";
    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, SCAN_CHUNK_BYTES, null);
      if (bytesRead === 0) break;
      // Read as latin1 so binary bytes round-trip as single-byte chars,
      // keeping the regex valid on both JS source and native binaries.
      const text = carry + buf.toString("latin1", 0, bytesRead);
      scanInto(text, seen);
      carry = text.slice(-SCAN_OVERLAP_CHARS);
      // Yield so message handling interleaves with the CPU-heavy regex pass.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } finally {
    await handle.close();
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
    const fingerprints: typeof scannedCandidates = [];
    for (const cliPath of candidates) {
      try {
        // Streamed + yielding so a ~236 MB binary scan never monopolises the
        // event loop (see scanFileInto).
        await scanFileInto(cliPath, seen);
        const st = await fs.promises.stat(cliPath);
        fingerprints.push({ path: cliPath, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        // unreadable candidate — skip
      }
    }
    cache = finalizeModels(seen);
    scannedCandidates = fingerprints;
    warming = null;
    return cache;
  })();
  return warming;
}

/**
 * Cheap staleness check: stat the files the last scan read and re-scan
 * only when one changed (a CLI upgrade rewrites the binary in place).
 * Returns true when a re-scan ran — the caller should re-push account
 * data so the dropdown picks up the new list. No-op while a scan is
 * already in flight or before the first scan completed (nothing to
 * compare against; the activation warm covers that case).
 */
export async function revalidateModelCache(): Promise<boolean> {
  if (warming || !cache || scannedCandidates.length === 0) return false;
  let changed = false;
  for (const c of scannedCandidates) {
    try {
      const st = await fs.promises.stat(c.path);
      if (st.mtimeMs !== c.mtimeMs || st.size !== c.size) {
        changed = true;
        break;
      }
    } catch {
      // Candidate deleted (uninstall / reinstall moved it) — re-scan.
      changed = true;
      break;
    }
  }
  if (!changed) return false;
  clearModelCache();
  await warmModelCache();
  return true;
}

/** Clear the cache so the next warm re-scans. Exposed for tests + reload. */
export function clearModelCache(): void {
  cache = null;
  warming = null;
  scannedCandidates = [];
}
