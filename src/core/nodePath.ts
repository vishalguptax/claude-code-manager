/**
 * The `node` binary baked into the commands we install into Claude Code
 * settings (statusline tap, SessionStart hook). Claude Code runs those in
 * a shell whose PATH may differ from VS Code's (the classic nvm case), so
 * the command carries an absolute node path rather than relying on PATH.
 */
import * as fs from "fs";
import { execFileSync } from "child_process";

let cached: string | null = null;

/**
 * fnm's `which node` answer is a per-shell symlink
 * (~/.local/state/fnm_multishells/<pid>_<ts>/bin/node): different in every
 * shell VS Code was launched from, and deleted when fnm cleans up. Baking
 * it rewrote ~/.claude/settings.json from every window and broke the
 * command once the directory went. Resolving it gives fnm's stable
 * versioned binary.
 *
 * Other links are kept as found on purpose: Homebrew's /opt/homebrew/bin/node
 * is the stable name (its target is a Cellar path that `brew upgrade`
 * deletes), and a Volta shim dispatches on its own name, so its target
 * (`volta-shim`) cannot be run as node.
 */
const EPHEMERAL_LINK = /[\\/]fnm_multishells[\\/]/;

function stablePath(found: string): string {
  if (!EPHEMERAL_LINK.test(found)) return found;
  try {
    return fs.realpathSync(found);
  } catch {
    return found;
  }
}

/**
 * Absolute node path, or bare "node" when detection fails (no worse
 * than the PATH lookup). Memoised: the spawn runs at most once per
 * extension host instead of on every install or activation pass.
 */
export function resolveNodePath(): string {
  if (cached !== null) return cached;
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const out = execFileSync(finder, ["node"], { encoding: "utf-8", timeout: 3000 });
    const first = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (first) {
      cached = stablePath(first);
      return cached;
    }
  } catch {
    /* detection failed — fall back to PATH lookup at run time */
  }
  cached = "node";
  return cached;
}

/** Extract the quoted node path from an installed command, "" when bare. */
function nodePathFromCommand(command: string): string {
  const m = /^"([^"]+)"/.exec(command);
  return m ? m[1] : "";
}

/**
 * Whether the node binary an installed command names can still run here.
 * An absolute one must exist and be executable — an nvm version switch or
 * fnm cleanup deletes it, leaving a command that names the right script
 * but never runs.
 *
 * A bare `node` is only trusted while detection still finds no absolute
 * node. It is what got baked when node was missing from VS Code's PATH at
 * install time; Claude Code's shell may lack it too, so once
 * `resolveNodePath()` can name a binary the bare command is reported
 * unusable and gets rewritten — trusting it unconditionally left it bare
 * forever.
 *
 * Callers keep a command that passes rather than rewriting it whenever a
 * fresh `resolveNodePath()` differs: windows launched from different
 * shells resolve different-but-working nodes, and rewriting on each one
 * churned ~/.claude/settings.json and widened write races with Claude Code.
 */
export function commandNodeUsable(command: string): boolean {
  const node = nodePathFromCommand(command);
  if (!node || node === "node") return resolveNodePath() === "node";
  try {
    fs.accessSync(node, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
