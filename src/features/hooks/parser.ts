/**
 * Hook parsing — reads Claude Code hooks from global, project, and local settings files.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createMtimeCache } from "../../core/mtimeCache";
import { loadActivePlugins, type ActivePlugin } from "../../core/plugins";
import { hookRecordIdentity, hookRecordTimeout, hookRecordType, type RawHookEntry } from "./hookRecord";
import type { Hook, HookScope } from "./types";

/** Hooks parsed from every scope, plus any per-file parse failures. */
export interface HooksParseResult {
  hooks: Hook[];
  errors: string[];
}

interface FileParseResult {
  hooks: Hook[];
  /** User-readable failure, naming the file, when the read/parse failed. */
  error?: string;
}

/**
 * Cache `FileParseResult` keyed by settings file path. The hooks list
 * is derived from settings.json — re-parsing the JSON every reload was
 * cheap individually but adds up across global + project + local
 * scopes when nothing has changed. Caching the error alongside the
 * hooks means a malformed file keeps reporting its error without
 * being re-read on every call.
 */
const hooksCache = createMtimeCache<FileParseResult>();

/** Path to the global settings file (~/.claude/settings.json). */
const GLOBAL_SETTINGS_FILE: string = path.join(os.homedir(), ".claude", "settings.json");

/**
 * Read hooks from a settings.json file at the given path.
 * Returns an empty hooks array (with no error) if the file is simply
 * missing; a read/parse failure is reported via `error`.
 *
 * @param filePath - Absolute path to a settings.json file
 * @param scope - Source label for the parsed hooks
 */
function readHooksFromFile(filePath: string, scope: HookScope): FileParseResult {
  // mtime cache wraps both the read and the parse — when settings.json
  // hasn't changed we skip both. On stat failure (typical: file
  // doesn't exist) the cache calls compute() uncached, which returns
  // an empty result for ENOENT.
  return hooksCache.get(filePath, (p) => {
    let raw: string;
    try {
      raw = fs.readFileSync(p, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { hooks: [] };
      const message = (err as Error).message;
      console.warn(`[claude-manager] Failed to read settings file ${p}:`, message);
      return { hooks: [], error: `Failed to read ${p}: ${message}` };
    }

    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch (err: unknown) {
      const message = (err as Error).message;
      console.warn(`[claude-manager] Failed to parse ${p}:`, message);
      return { hooks: [], error: `Failed to parse ${p}: ${message}` };
    }

    const hooks: Hook[] = [];
    // Active block first, then the parked `_disabled_hooks` block (if
    // any). We tag each hook with its `disabled` origin so the UI can
    // render and toggle it without re-reading the file.
    collectFromBlock(settings.hooks, { scope, disabled: false }, hooks);
    collectFromBlock(settings._disabled_hooks, { scope, disabled: true }, hooks);
    return { hooks };
  });
}

/**
 * Extract hooks declared inline in a plugin's `plugin.json`. Plugins
 * use the same `hooks` shape as `settings.json` but never have a
 * disabled block — they are either present or not.
 */
function readPluginHooks(plugin: ActivePlugin): Hook[] {
  const block = plugin.manifest.hooks;
  if (!block) return [];
  const out: Hook[] = [];
  collectFromBlock(
    block,
    { scope: "plugin", disabled: false, pluginName: plugin.qualifiedName },
    out,
  );
  return out;
}

interface CollectOpts {
  scope: HookScope;
  disabled: boolean;
  /** Qualified plugin name to stamp on each emitted hook (plugin scope only). */
  pluginName?: string;
}

function collectFromBlock(block: unknown, opts: CollectOpts, out: Hook[]): void {
  if (!block || typeof block !== "object" || Array.isArray(block)) return;
  const map = block as Record<string, RawHookEntry[]>;

  // Hooks can be in two formats:
  // Format A (flat):  { "PreToolUse": [{ matcher, command }] }
  // Format B (nested): { "Stop": [{ matcher, hooks: [{ type, command, timeout }] }] }
  // Non-command action types (prompt/agent/http/mcp_tool) only occur
  // in the nested `hooks` array; the identity/timeout readers handle
  // both shapes uniformly.
  for (const [event, entries] of Object.entries(map)) {
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry, entryIndex) => {
      if (!entry || typeof entry !== "object") return;
      const matcher = typeof entry.matcher === "string" ? entry.matcher : "";

      if (Array.isArray(entry.hooks)) {
        entry.hooks.forEach((sub, commandIndex) => {
          if (!sub || typeof sub !== "object") return;
          const command = hookRecordIdentity(sub);
          if (!command) return;
          out.push({
            event,
            matcher,
            command,
            scope: opts.scope,
            disabled: opts.disabled,
            pluginName: opts.pluginName,
            hookType: hookRecordType(sub),
            timeout: hookRecordTimeout(sub),
            entryIndex,
            commandIndex,
          });
        });
        return;
      }

      const command = hookRecordIdentity(entry);
      if (!command) return;
      out.push({
        event,
        matcher,
        command,
        scope: opts.scope,
        disabled: opts.disabled,
        pluginName: opts.pluginName,
        hookType: hookRecordType(entry),
        timeout: hookRecordTimeout(entry),
        entryIndex,
        commandIndex: null,
      });
    });
  }
}

/**
 * Parse all hooks from global, project, and local settings files.
 *
 * Reads from:
 * - ~/.claude/settings.json (global)
 * - <workspace>/.claude/settings.json (project)
 * - <workspace>/.claude/settings.local.json (local, gitignored)
 *
 * A malformed settings file contributes an error string (naming the
 * file) instead of aborting the whole parse — the other scopes still
 * parse normally, so one bad file degrades the list instead of
 * blanking it.
 *
 * @param workspacePath - Absolute path to the current workspace folder. Optional.
 */
export function parseHooks(workspacePath?: string): HooksParseResult {
  const hooks: Hook[] = [];
  const errors: string[] = [];

  const collect = (result: FileParseResult): void => {
    hooks.push(...result.hooks);
    if (result.error) errors.push(result.error);
  };

  // Global hooks
  collect(readHooksFromFile(GLOBAL_SETTINGS_FILE, "global"));

  // Project + local hooks
  if (workspacePath) {
    const projectSettings = path.join(workspacePath, ".claude", "settings.json");
    const localSettings = path.join(workspacePath, ".claude", "settings.local.json");
    collect(readHooksFromFile(projectSettings, "project"));
    collect(readHooksFromFile(localSettings, "local"));
  }

  // Plugin-declared hooks (read-only). Plugin manifests are already
  // validated at install time by Claude Code, so parse failures here
  // aren't surfaced the same way — a broken plugin manifest is a
  // plugin-install problem, not a settings.json problem.
  for (const plugin of loadActivePlugins(workspacePath)) {
    hooks.push(...readPluginHooks(plugin));
  }

  return { hooks, errors };
}
