/**
 * The per-plugin actions offered on right-click and in the detail view.
 *
 * Built here rather than in a view because the set is conditional — a plugin
 * with no install has no folder to open, a managed or blocklisted one has no
 * switch — and those conditions are the feature's rules, not a component's
 * layout concern.
 */
import type { ContextMenuItem } from "../../../../webview/shared/ui";
import type { PluginEntry, PluginSettingsScope } from "../../types";
import { canToggle, SCOPE_LABEL, toggleScope } from "./labels";

/** Scopes a user can be sent to edit, lowest precedence first. */
export const EDITABLE_SCOPES: readonly PluginSettingsScope[] = [
  "global",
  "project",
  "local",
] as const;

/** What a menu entry needs to be able to do. */
export interface PluginMenuHandlers {
  onToggle: (plugin: PluginEntry) => void;
  onOpenDirectory: (id: string) => void;
  onCopyId: (id: string) => void;
  onOpenSettings: (scope: PluginSettingsScope) => void;
}

export function buildPluginMenu(
  plugin: PluginEntry,
  handlers: PluginMenuHandlers,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const target = toggleScope(plugin);
  if (canToggle(plugin) && target !== null) {
    items.push({
      label: `${plugin.enabled ? "Disable" : "Enable"} in ${SCOPE_LABEL[target]} settings`,
      icon: plugin.enabled ? "eye-off" : "eye",
      onSelect: () => handlers.onToggle(plugin),
    });
  }
  if (plugin.installed) {
    items.push({
      label: "Open plugin folder",
      icon: "folder",
      onSelect: () => handlers.onOpenDirectory(plugin.id),
    });
  }
  items.push({
    label: "Copy plugin id",
    icon: "copy",
    onSelect: () => handlers.onCopyId(plugin.id),
  });
  // Every settings file, not just the winning one: an override is only
  // fixable from the file that set it, and which file that is has just been
  // shown on the row.
  for (const scope of EDITABLE_SCOPES) {
    items.push({
      label: `Open ${SCOPE_LABEL[scope]} settings.json`,
      icon: "settings",
      separatorBefore: scope === EDITABLE_SCOPES[0],
      onSelect: () => handlers.onOpenSettings(scope),
    });
  }
  return items;
}
