/**
 * Standalone statusline tap — bundled to `dist/statusline-tap.js`, then
 * copied by the installer to `~/.claude/.claude-manager/statusline-tap.js`
 * and wired as Claude Code's `statusLine.command`.
 *
 * IMPORTANT: this runs as its OWN Node process, spawned by Claude Code
 * once per statusline render. It is NEVER imported by the extension
 * host. It must therefore be self-contained (esbuild inlines its
 * imports) and must never crash the status bar — every failure path
 * falls back to emitting *some* line and exits 0.
 *
 * Responsibilities, in order:
 *   1. Read the JSON payload Claude Code pipes on stdin.
 *   2. Cache the rate-limit / model / context / cost subset so the
 *      extension can read it with no network call (see statuslineCore).
 *   3. Chain the user's original statusline command (recorded by the
 *      installer) so their bar is unchanged — or, if they had none,
 *      print a compact default line built from the payload.
 */
import * as fs from "fs";
import { spawnSync } from "child_process";
import {
  CLAUDE_MANAGER_DIR,
  STATUSLINE_CACHE_FILE,
  STATUSLINE_INNER_FILE,
} from "../../core/config";
import { extractCache, renderDefaultLine } from "./statuslineCore";

/** Read all of stdin synchronously. Returns "" if stdin is empty/closed. */
function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

/** Write the cache atomically (tmp + rename) so readers never see a torn file. */
function writeCache(json: string): void {
  try {
    fs.mkdirSync(CLAUDE_MANAGER_DIR, { recursive: true });
    const tmp = `${STATUSLINE_CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, STATUSLINE_CACHE_FILE);
  } catch {
    // A failed cache write must not break the status bar — the panel
    // simply shows "no data yet" until the next successful render.
  }
}

/** The user's original statusLine.command, recorded at install time. */
function readInnerCommand(): string {
  try {
    const raw = fs.readFileSync(STATUSLINE_INNER_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { command?: unknown };
    return typeof parsed.command === "string" ? parsed.command : "";
  } catch {
    return "";
  }
}

/**
 * Run the chained command, feeding it the same stdin Claude Code gave
 * us, and forward its stdout verbatim. Returns null when there is no
 * inner command or it produced nothing usable, so main() can fall back
 * to the default line.
 */
function runInner(command: string, stdin: string): string | null {
  if (!command) return null;
  try {
    const res = spawnSync(command, {
      shell: true,
      input: stdin,
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    });
    if (res.status === 0 && typeof res.stdout === "string") return res.stdout;
  } catch {
    // fall through to default line
  }
  return null;
}

function main(): void {
  const raw = readStdin();
  const cache = extractCache(raw, Date.now());
  if (cache) writeCache(JSON.stringify(cache));

  const chained = runInner(readInnerCommand(), raw);
  if (chained !== null) {
    process.stdout.write(chained);
  } else if (cache) {
    process.stdout.write(renderDefaultLine(cache));
  }
}

main();
