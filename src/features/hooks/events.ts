/**
 * Catalog of known Claude Code hook events, shared by the "add hook"
 * wizard (extension host, `featureHandlers.ts`) and the display-label
 * map (webview, `lib/labels.ts`). Kept in its own file with no vscode
 * import so both sides can use it directly. `HookEvent` (types.ts)
 * still accepts any string — this list is display/UX only, not a
 * runtime allowlist, since Claude Code may add events before this
 * catalog is updated.
 */

/** Events whose matcher is tested against the tool name (`tool_name`). */
const TOOL_EVENTS: ReadonlySet<string> = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
]);

interface MatcherInfo {
  /** What the matcher is tested against, phrased as a field label. */
  subject: string;
  /** Known values, `|`-joined the way a matcher alternates them. */
  values?: string;
}

const TOOL_MATCHER: MatcherInfo = { subject: "Tool name or pattern" };

/**
 * Events whose `matcher` Claude Code actually tests, and what it tests it
 * against. Verified 2026-10-02 against the Claude Code 2.1.287 binary: its
 * match-query switch maps each event to one hook-input field (tool events →
 * `tool_name`, SessionStart → `source`, Notification → `notification_type`,
 * …) and skips matching entirely for every event it maps to nothing (Stop,
 * UserPromptSubmit, TeammateIdle, …). `values` are the enums the same binary
 * declares for those fields; Notification lists only the common types.
 *
 * This list drives display and input hints only. It must never be used to
 * drop a matcher a hook already has (see `showsMatcher`): a CLI release can
 * make another event matchable before this table catches up, and blanking
 * the matcher would silently widen the hook to fire on every occurrence.
 */
const MATCHERS: Readonly<Record<string, MatcherInfo>> = {
  ...Object.fromEntries([...TOOL_EVENTS].map((name) => [name, TOOL_MATCHER])),
  UserPromptExpansion: { subject: "Command name" },
  SessionStart: { subject: "Source", values: "startup|resume|clear|compact|fork" },
  SessionEnd: { subject: "Reason", values: "clear|resume|logout|prompt_input_exit|other" },
  Setup: { subject: "Trigger", values: "init|maintenance" },
  PreCompact: { subject: "Trigger", values: "manual|auto" },
  PostCompact: { subject: "Trigger", values: "manual|auto" },
  PreModelSwitch: { subject: "Target model" },
  PostModelSwitch: { subject: "Target model" },
  Notification: {
    subject: "Notification type",
    values: "permission_prompt|idle_prompt|auth_success|elicitation_dialog",
  },
  StopFailure: { subject: "Error" },
  SubagentStart: { subject: "Agent type" },
  SubagentStop: { subject: "Agent type" },
  Elicitation: { subject: "MCP server name" },
  ElicitationResult: { subject: "MCP server name" },
  ConfigChange: {
    subject: "Source",
    values: "user_settings|project_settings|local_settings|policy_settings|skills",
  },
  DirectoryAdded: { subject: "Source" },
  InstructionsLoaded: {
    subject: "Load reason",
    values: "session_start|nested_traversal|path_glob_match|include|compact",
  },
  FileChanged: { subject: "File name" },
};

/** What the event's matcher is tested against, or undefined if Claude Code ignores it. */
export function matcherInfo(event: string): MatcherInfo | undefined {
  return Object.hasOwn(MATCHERS, event) ? MATCHERS[event] : undefined;
}

/** e.g. "Source: startup|resume|clear|compact|fork (blank = match all)". */
export function matcherPlaceholder(info: MatcherInfo | undefined): string {
  if (!info) return "Matcher";
  const values = info.values ? `: ${info.values}` : "";
  return `${info.subject}${values} (blank = match all)`;
}

/** True when Claude Code tests the matcher for this event. */
export function eventUsesMatcher(event: string): boolean {
  return matcherInfo(event) !== undefined;
}

/**
 * Whether the UI should show a hook's matcher: always for a matchable event
 * (blank reads as "match all"), and for any other event whenever one is set,
 * so an existing matcher is never hidden from view or dropped on save.
 */
export function showsMatcher(event: string, matcher: string): boolean {
  return eventUsesMatcher(event) || matcher !== "";
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
