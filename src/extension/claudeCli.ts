/**
 * The word that starts Claude Code on a command line this extension sends to
 * an integrated terminal.
 *
 * Normally that is `claude`. Someone who installed only the official Claude
 * Code extension has no `claude` on their PATH, yet the extension ships the
 * same CLI as a native binary — the one its own "Open in Terminal" runs. When
 * `claude` cannot be found, every terminal command here starts that binary
 * instead, so Resume, New Session and the rest work for them too. A `claude`
 * the user installed always wins: they chose its version.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { CLAUDE_DIR } from "../core/config";
import { CLAUDE_CODE_EXTENSION_ID } from "./claudeCodeExtension";

const EXE = process.platform === "win32" ? "claude.exe" : "claude";

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Whether a `claude` the user installed would answer in their terminal.
 *
 * The extension host's PATH is the one VS Code resolved from the user's login
 * shell, so it matches what an integrated terminal sees. Two installs live
 * off it: the native installer's `~/.local/bin`, which a shell rc may add
 * only in interactive shells, and the legacy `<config dir>/local` install,
 * which is reached through a shell alias rather than PATH.
 */
function userClaudeInstalled(): boolean {
  const names =
    process.platform === "win32"
      ? ["claude.exe", "claude.cmd", "claude.bat", "claude.ps1"]
      : ["claude"];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  dirs.push(path.join(os.homedir(), ".local", "bin"), path.join(CLAUDE_DIR, "local"));
  return dirs.some((dir) => names.some((name) => isFile(path.join(dir, name))));
}

/**
 * The official extension's bundled binary, where it keeps it: per platform
 * under `native-binaries/` (with the x64 build serving Windows on ARM), or a
 * single `native-binary/`.
 */
function bundledClaude(): string | undefined {
  const root = vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION_ID)?.extensionPath;
  if (!root) return undefined;
  const resources = path.join(root, "resources");
  const platforms = [`${process.platform}-${process.arch}`];
  if (process.platform === "win32" && process.arch === "arm64") platforms.push("win32-x64");
  const candidates = [
    ...platforms.map((p) => path.join(resources, "native-binaries", p, EXE)),
    path.join(resources, "native-binary", EXE),
  ];
  return candidates.find(isFile);
}

/**
 * Quote an absolute program path for the shell VS Code opens terminals in.
 * PowerShell needs the call operator to run a quoted path; cmd takes double
 * quotes; POSIX shells take single quotes, which nothing inside expands.
 */
export function quoteProgram(program: string, shell: string): string {
  // Either separator: `path.basename` splits only on the host's own.
  const name = (shell.split(/[\\/]/).pop() ?? "").toLowerCase();
  if (name.startsWith("pwsh") || name.startsWith("powershell")) {
    return `& '${program.replace(/'/g, "''")}'`;
  }
  if (name === "cmd.exe" || name === "cmd") return `"${program}"`;
  return `'${program.replace(/'/g, `'\\''`)}'`;
}

/** `claude`, or the official extension's bundled CLI when `claude` is missing. */
export function claudeCli(): string {
  if (userClaudeInstalled()) return "claude";
  const bundled = bundledClaude();
  // Neither: `claude` still, so the shell's own "not found" names the problem.
  return bundled ? quoteProgram(bundled, vscode.env.shell) : "claude";
}
