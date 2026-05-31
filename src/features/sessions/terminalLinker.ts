/**
 * Best-effort link from a VS Code terminal to the Claude session it hosts,
 * for terminals we did NOT create ourselves (bare `claude --resume <id>`
 * typed into any terminal, external launches, etc).
 *
 * Mechanism: listen to `vscode.window.onDidStartTerminalShellExecution`
 * and scan the executed command line for `claude --resume <uuid>`. When
 * matched, register the (sessionId, terminal) pair with the shared
 * TerminalRegistry so the row + detail action swap to "View".
 *
 * Requires VS Code shell integration to be active in the terminal (auto
 * for bash/zsh/fish/pwsh on macOS/Linux/Windows; cmd.exe is not
 * supported). Feature-detects the API so older VS Code builds degrade to
 * no-op instead of crashing.
 */
import * as vscode from "vscode";
import type { TerminalRegistry } from "./terminalRegistry";

/**
 * Capture the UUID from a `claude … --resume <uuid>` invocation. The
 * leading `\bclaude\b` matches the bare command, an absolute/relative
 * path that ends in `claude`, and post-shell-separator placements
 * (after `&&`, `;`, `|`, env-var prefixes, etc). Case-insensitive on
 * the prefix; the UUID character class is already case-insensitive.
 */
const RESUME_CMD_RE =
  /\bclaude\b[^|;&]*?\s--resume\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Pure helper — exported for unit tests. Returns the UUID or null. */
export function extractResumeId(commandLine: string): string | null {
  const m = commandLine.match(RESUME_CMD_RE);
  return m ? m[1].toLowerCase() : null;
}

interface ShellExecutionStartEvent {
  terminal: vscode.Terminal;
  execution: { commandLine?: { value?: string } };
}

interface ShellExecutionApi {
  onDidStartTerminalShellExecution?: (
    listener: (e: ShellExecutionStartEvent) => void,
  ) => vscode.Disposable;
}

/**
 * Subscribe to terminal shell executions and register any session
 * detected in the command line. Returns a Disposable; safe to call when
 * the host VS Code is too old to expose the API (returns a no-op
 * disposable in that case).
 */
export function createTerminalLinker(registry: TerminalRegistry): vscode.Disposable {
  const api = vscode.window as unknown as ShellExecutionApi;
  const subscribe = api.onDidStartTerminalShellExecution;
  if (typeof subscribe !== "function") {
    return { dispose: () => {} };
  }
  return subscribe((e) => {
    const cmd = e.execution.commandLine?.value ?? "";
    const id = extractResumeId(cmd);
    if (id) registry.register(id, e.terminal);
  });
}
