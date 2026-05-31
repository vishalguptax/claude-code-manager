/**
 * Display-label maps shared across the hooks webview views.
 * Kept framework-agnostic so both list and detail views import the
 * same source of truth instead of duplicating the label tables.
 */
import type { Hook, HookScope } from "../../types";

/** Map known event names to user-friendly display labels. */
const EVENT_LABELS: Record<string, string> = {
  PreToolUse: "Pre Tool Use",
  PostToolUse: "Post Tool Use",
  Notification: "Notification",
  Stop: "Stop",
  SubagentStop: "Subagent Stop",
  PreCompact: "Pre Compact",
};

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
