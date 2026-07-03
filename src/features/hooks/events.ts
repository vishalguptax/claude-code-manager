/**
 * Catalog of known Claude Code hook events, shared by the "add hook"
 * wizard (extension host, `featureHandlers.ts`) and the display-label
 * map (webview, `lib/labels.ts`). Kept in its own file with no vscode
 * import so both sides can use it directly. `HookEvent` (types.ts)
 * still accepts any string — this list is display/UX only, not a
 * runtime allowlist, since Claude Code may add events before this
 * catalog is updated.
 */

export interface HookEventInfo {
  /** The raw event name as written in settings.json. */
  name: string;
  /** User-friendly display label. */
  label: string;
  description: string;
}

export const KNOWN_HOOK_EVENTS: readonly HookEventInfo[] = [
  { name: "SessionStart", label: "Session Start", description: "When a session starts" },
  { name: "SessionEnd", label: "Session End", description: "When a session ends" },
  {
    name: "UserPromptSubmit",
    label: "User Prompt Submit",
    description: "Before a submitted prompt is processed",
  },
  { name: "PreToolUse", label: "Pre Tool Use", description: "Before any tool runs" },
  { name: "PostToolUse", label: "Post Tool Use", description: "After a tool finishes" },
  {
    name: "PostToolUseFailure",
    label: "Post Tool Use Failure",
    description: "After a tool call fails",
  },
  { name: "Notification", label: "Notification", description: "On a Claude Notification event" },
  { name: "Stop", label: "Stop", description: "When the user stops the run" },
  { name: "SubagentStart", label: "Subagent Start", description: "When a subagent starts" },
  { name: "SubagentStop", label: "Subagent Stop", description: "When a subagent finishes" },
  { name: "PreCompact", label: "Pre Compact", description: "Before context auto-compaction" },
  { name: "PostCompact", label: "Post Compact", description: "After context auto-compaction" },
  {
    name: "PermissionRequest",
    label: "Permission Request",
    description: "When a tool permission is requested",
  },
  {
    name: "PermissionDenied",
    label: "Permission Denied",
    description: "When a tool permission is denied",
  },
];
