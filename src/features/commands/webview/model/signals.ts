/**
 * Reactive state for the commands feature webview. Replaces the vanilla
 * module-scoped state store with @preact/signals so views re-render
 * automatically when state changes.
 */
import { computed, signal } from "@preact/signals";
import type { Command, CommandScope } from "../../types";

/** Filter values surfaced in the scope filter bar (`all` plus each scope). */
export type ScopeFilter = "all" | CommandScope;

/** Full command list as last received from the host. */
export const commands = signal<Command[]>([]);
/** Currently selected command, or null when showing the list. */
export const selected = signal<Command | null>(null);
/** Whether a load request is in flight. */
export const loading = signal<boolean>(true);
/** Error message from the host, or null when there is no error. */
export const errorMessage = signal<string | null>(null);
/** Lowercased search query. */
export const searchQuery = signal<string>("");
/** Active scope filter. */
export const scopeFilter = signal<ScopeFilter>("all");
/**
 * Whether the official Claude Code extension is installed. Drives the
 * launch-in-chat affordance. Pushed from the host via the `settings`
 * message; defaults to false so the button stays hidden until confirmed.
 */
export const claudeCodeInstalled = signal<boolean>(false);

/** Sort priority for command scopes: built-ins → project → global → plugin. */
const SCOPE_ORDER: Record<CommandScope, number> = {
  builtin: 0,
  project: 1,
  global: 2,
  plugin: 3,
};

/** Count of commands in a given scope across the full (unfiltered) list. */
export function countByScope(scope: CommandScope): number {
  return commands.value.filter((c) => c.scope === scope).length;
}

/**
 * Commands filtered by the active scope filter and search query, then
 * sorted by scope priority, plugin name, and command name.
 */
export const filteredCommands = computed<Command[]>(() => {
  const query = searchQuery.value;
  const scope = scopeFilter.value;
  let list = commands.value;

  if (scope !== "all") {
    list = list.filter((c) => c.scope === scope);
  }

  if (query) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.content.toLowerCase().includes(query) ||
        (c.description ?? "").toLowerCase().includes(query),
    );
  }

  return [...list].sort((a, b) => {
    if (a.scope !== b.scope) {
      return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    }
    if (a.scope === "plugin" && a.pluginName !== b.pluginName) {
      return (a.pluginName ?? "").localeCompare(b.pluginName ?? "");
    }
    return a.name.localeCompare(b.name);
  });
});

/** Reset feature signals to their initial values. Test + unmount helper. */
export function resetCommandSignals(): void {
  commands.value = [];
  selected.value = null;
  loading.value = true;
  errorMessage.value = null;
  searchQuery.value = "";
  scopeFilter.value = "all";
  claudeCodeInstalled.value = false;
}
