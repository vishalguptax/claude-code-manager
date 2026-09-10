/**
 * Catalog of known Claude Code hook events, shared by the "add hook"
 * wizard (extension host, `featureHandlers.ts`) and the display-label
 * map (webview, `lib/labels.ts`). Kept in its own file with no vscode
 * import so both sides can use it directly. `HookEvent` (types.ts)
 * still accepts any string — this list is display/UX only, not a
 * runtime allowlist, since Claude Code may add events before this
 * catalog is updated.
 */

/**
 * Events that match against a tool name — the only ones for which the `matcher`
 * field is meaningful. For every other event (SessionStart, Stop, Notification,
 * PreCompact, …) a matcher has no effect, so the UI must not show a matcher
 * badge/`*`/input that implies tool-matching the event can't do.
 */
export const MATCHER_EVENTS: ReadonlySet<string> = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
]);

/** True when the event uses the tool-name matcher field. */
export function eventUsesMatcher(event: string): boolean {
  return MATCHER_EVENTS.has(event);
}

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
  {
    name: "PostToolBatch",
    label: "Post Tool Batch",
    description: "Once after every tool call in a batch has resolved",
  },
  {
    name: "UserPromptExpansion",
    label: "User Prompt Expansion",
    description: "When a slash command or other prompt expansion resolves",
  },
  { name: "Notification", label: "Notification", description: "On a Claude Notification event" },
  { name: "Stop", label: "Stop", description: "When the user stops the run" },
  { name: "StopFailure", label: "Stop Failure", description: "When a run stops on an error" },
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
  {
    name: "PreModelSwitch",
    label: "Pre Model Switch",
    description: "Before the session switches model",
  },
  {
    name: "PostModelSwitch",
    label: "Post Model Switch",
    description: "After the session switches model",
  },
  { name: "Setup", label: "Setup", description: "On init and maintenance setup runs" },
  {
    name: "TeammateIdle",
    label: "Teammate Idle",
    description: "When a teammate session goes idle",
  },
  { name: "TaskCreated", label: "Task Created", description: "When a task is created" },
  { name: "TaskCompleted", label: "Task Completed", description: "When a task completes" },
  {
    name: "Elicitation",
    label: "Elicitation",
    description: "When an MCP server requests user input",
  },
  {
    name: "ElicitationResult",
    label: "Elicitation Result",
    description: "After the user answers an MCP elicitation",
  },
  {
    name: "ConfigChange",
    label: "Config Change",
    description: "When a settings or config file changes",
  },
  {
    name: "WorktreeCreate",
    label: "Worktree Create",
    description: "When a session worktree is created",
  },
  {
    name: "WorktreeRemove",
    label: "Worktree Remove",
    description: "When a session worktree is removed",
  },
  {
    name: "InstructionsLoaded",
    label: "Instructions Loaded",
    description: "When a CLAUDE.md / instructions file is loaded",
  },
  {
    name: "CwdChanged",
    label: "Cwd Changed",
    description: "When the working directory changes",
  },
  { name: "FileChanged", label: "File Changed", description: "When a watched file changes" },
  {
    name: "DirectoryAdded",
    label: "Directory Added",
    description: "When a directory is added to the session",
  },
  {
    name: "MessageDisplay",
    label: "Message Display",
    description: "As assistant output streams — display only",
  },
];
