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

/**
 * Map scope to its short user-visible label.
 *
 * Lowercase, because this label goes in a scope chip and every other tab —
 * Skills, Commands, MCP, Agents — renders `project` / `global` / `plugin` in
 * lowercase. Hooks was the one tab shouting `Project` at the same chip size,
 * next to the same colours, which read as a different kind of thing rather
 * than the same thing on another tab.
 */
const SCOPE_LABELS: Record<HookScope, string> = {
  global: "global",
  project: "project",
  local: "local",
  plugin: "plugin",
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
    return `plugin: ${hook.pluginName ?? "unknown"}`;
  }
  return SCOPE_LABELS[hook.scope] ?? hook.scope;
}

/** Matcher text for display — blank matchers mean "match anything". */
export function matcherDisplay(matcher: string): string {
  return matcher || "* (any)";
}

