/**
 * Display-label maps shared across the hooks webview views.
 * Kept framework-agnostic so both list and detail views import the
 * same source of truth instead of duplicating the label tables.
 */
import { KNOWN_HOOK_EVENTS } from "../../events";
import type { Hook, HookScope } from "../../types";

/** Map known event names to user-friendly display labels. */
const EVENT_LABELS: Record<string, string> = Object.fromEntries(
  KNOWN_HOOK_EVENTS.map((e) => [e.name, e.label]),
);

/** Map scope to its short user-visible label. */
const SCOPE_LABELS: Record<HookScope, string> = {
  global: "Global",
  project: "Project",
  local: "Local",
  plugin: "Plugin",
};

/** Friendly label for an event, falling back to the raw event name. */
export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event;
}

/**
 * Label for a hook's scope. Plugin hooks fold their qualified plugin
 * name into the badge so the source is obvious at a glance.
 */
export function scopeLabel(hook: Pick<Hook, "scope" | "pluginName">): string {
  if (hook.scope === "plugin") {
    return `Plugin: ${hook.pluginName ?? "unknown"}`;
  }
  return SCOPE_LABELS[hook.scope] ?? hook.scope;
}

/** Matcher text for display — blank matchers mean "match anything". */
export function matcherDisplay(matcher: string): string {
  return matcher || "* (any)";
}

/**
 * CSS modifier class for a scope badge, matching the green/neutral/purple
 * palette every other feature's scope badge already uses (skills, commands,
 * mcp) — hooks scope badges previously carried no colour at all. `local` has
 * no precedent elsewhere (only hooks has a fourth, workspace-local scope); it
 * shares project's green since both are non-global/non-plugin, distinguished
 * by the scopeLabel text ("Local" vs "Project").
 */
export function scopeClass(scope: HookScope): string {
  switch (scope) {
    case "project":
    case "local":
      return "hook-scope-project";
    case "plugin":
      return "hook-scope-plugin";
    default:
      return "hook-scope-global";
  }
}
