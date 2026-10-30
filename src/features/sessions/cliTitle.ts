/**
 * What Claude Code puts in its own terminal title, read from the same
 * settings the CLI reads, so a session tab can be left to follow that title
 * only when it will actually show the session's name.
 *
 * The CLI's title is, in order: its custom title (a rename) unless
 * `terminalTitleFromRename` is false, then its `ai-title`, then "Claude Code".
 * It writes none at all when `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` is set —
 * an unnamed tab would then show the process name, so callers fall back to a
 * name of their own.
 */
import { asObject, readJsonObject } from "../../core/jsonFile";
import { claudeSettingsPath } from "../../core/config";

const DISABLE_TITLE_ENV = "CLAUDE_CODE_DISABLE_TERMINAL_TITLE";

export interface CliTitlePolicy {
  /** The CLI writes a terminal title at all. */
  writesTitle: boolean;
  /** A custom title (rename) outranks the `ai-title` in that title. */
  fromRename: boolean;
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/** Claude Code's reading of a boolean env var. */
function envTruthy(value: unknown): boolean {
  return typeof value === "string" && TRUTHY.has(value.trim().toLowerCase());
}

/**
 * Read the policy for a `claude` launched in `workspacePath`.
 *
 * Settings merge global → project → local, later files winning, as the CLI
 * merges them. The variable counts from the extension host's own environment
 * too: integrated terminals inherit it.
 */
export function readCliTitlePolicy(
  workspacePath: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): CliTitlePolicy {
  let disabled = envTruthy(env[DISABLE_TITLE_ENV]);
  let fromRename = true;
  for (const scope of ["global", "project", "local"] as const) {
    const file = claudeSettingsPath(scope, workspacePath);
    if (!file) continue;
    const read = readJsonObject(file);
    if (read.kind !== "ok") continue;
    if (envTruthy(asObject(read.data.env)?.[DISABLE_TITLE_ENV])) disabled = true;
    if (typeof read.data.terminalTitleFromRename === "boolean") {
      fromRename = read.data.terminalTitleFromRename;
    }
  }
  return { writesTitle: !disabled, fromRename };
}
