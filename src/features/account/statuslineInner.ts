/**
 * Sidecar record shapes + pure helpers, shared by the extension-host
 * installer and the standalone tap script (esbuild inlines this into
 * the tap bundle — keep it free of vscode and Node imports).
 *
 * v2 is multi-entry: the tap installs at the GLOBAL scope once (quota
 * is a machine-wide feature) and adds a per-workspace LOCAL override
 * only where a project/local statusline shadows the global one. The
 * shared, git-committed project settings file is never written — the
 * tap command embeds machine-absolute paths (node binary, home dir)
 * that would break every other contributor's statusline (the
 * "C:\\Users\\winuser" bug).
 *
 * v1 was a single `{scope, command, workspacePath}` record. It broke
 * with more than one workspace: a second install overwrote the first
 * workspace's restore info, and the tap chained one command globally
 * even when different projects had different statuslines.
 */
import type { PermissionScope } from "./types";

/** One workspace's local-scope override. */
export interface WorkspaceOverride {
  /**
   * Scope whose command the tap shadows in this workspace:
   *   - "project": the shared settings file defines the statusline; we
   *     created `.claude/settings.local.json` to out-precede it.
   *     Uninstall DELETES the local key (project supplies the command
   *     again).
   *   - "local": the user's own local statusline was here; we replaced
   *     it. Uninstall restores `priorCommand` at local.
   */
  sourceScope: "project" | "local";
  /** Command to chain while installed and to restore on uninstall. */
  priorCommand: string;
}

/** v2 sidecar — written by the installer, read by tap + uninstaller. */
export interface InnerRecordV2 {
  version: 2;
  /** Global-scope install record. Null until the global write happened. */
  global: { priorCommand: string } | null;
  /** Workspace path → local-override record. */
  workspaces: Record<string, WorkspaceOverride>;
}

/** v1 sidecar — single scope. Still readable for migration. */
export interface InnerRecordV1 {
  scope: PermissionScope;
  command: string;
  workspacePath?: string;
}

export type InnerRecord = InnerRecordV2 | InnerRecordV1;

export function isV2(rec: InnerRecord): rec is InnerRecordV2 {
  return (rec as InnerRecordV2).version === 2;
}

/** Parse a sidecar JSON string into either shape. Null when unusable. */
export function parseInner(raw: string): InnerRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const rec = parsed as Partial<InnerRecordV2> & Partial<InnerRecordV1>;
  if (rec.version === 2) {
    return {
      version: 2,
      global:
        rec.global && typeof rec.global === "object"
          ? { priorCommand: str((rec.global as { priorCommand?: unknown }).priorCommand) }
          : null,
      workspaces: sanitizeWorkspaces(rec.workspaces),
    };
  }
  if (rec.scope === "global" || rec.scope === "project" || rec.scope === "local") {
    return {
      scope: rec.scope,
      command: str(rec.command),
      workspacePath: typeof rec.workspacePath === "string" ? rec.workspacePath : undefined,
    };
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function sanitizeWorkspaces(v: unknown): Record<string, WorkspaceOverride> {
  const out: Record<string, WorkspaceOverride> = {};
  if (typeof v !== "object" || v === null) return out;
  for (const [ws, entry] of Object.entries(v as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { sourceScope?: unknown; priorCommand?: unknown };
    if (e.sourceScope !== "project" && e.sourceScope !== "local") continue;
    out[ws] = { sourceScope: e.sourceScope, priorCommand: str(e.priorCommand) };
  }
  return out;
}

/**
 * Command the tap should chain for a render coming from `projectDir`.
 * Workspace override wins (that project's own statusline design);
 * otherwise the global prior command; "" means "no chain — render the
 * default line". v1 records chain their single recorded command,
 * matching the old tap behaviour.
 */
export function resolveChainCommand(
  rec: InnerRecord | null,
  projectDir: string,
): string {
  if (!rec) return "";
  if (!isV2(rec)) return rec.command;
  if (projectDir && rec.workspaces[projectDir]) {
    return rec.workspaces[projectDir].priorCommand;
  }
  return rec.global?.priorCommand ?? "";
}

/**
 * True when a statusLine command points at ANY machine's copy of our
 * tap — matched on the script basename so a Windows path committed
 * into a shared file is still recognized on macOS/Linux. Use for
 * "is this entry ours" (cleanup, don't-chain-our-own-tap); use the
 * exact this-machine path for "is it working here".
 */
export function isTapCommand(command: string): boolean {
  return command.includes("statusline-tap.js");
}
