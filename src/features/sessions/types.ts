/**
 * Type definitions for the sessions feature.
 * Covers session data, grouping, statistics, JSONL entries, and message protocol.
 */

import type { HooksWebviewMessage } from "../hooks/types";

// ── Session Data ──

/** A parsed Claude Code session with metadata and prompt history. */
export interface Session {
  /** Unique session identifier */
  id: string;
  /** User-set name (via `claude -n`) or empty string */
  name: string;
  /** Project folder name (last segment of projectPath) */
  project: string;
  /** Absolute path to the project directory */
  projectPath: string;
  /** Git branch the session was started on */
  branch: string;
  /** How the session was launched: "cli", "vscode", or "" */
  entrypoint: string;
  /** Timestamp (ms) of the first recorded prompt */
  startTime: number;
  /** Timestamp (ms) of the most recent prompt */
  endTime: number;
  /** Number of user prompts in the session */
  messageCount: number;
  /** First prompt, truncated to 100 chars */
  summary: string;
  /** All user prompts in chronological order */
  prompts: string[];
  /**
   * Lowercased project name. Pre-computed at parse time so case-insensitive
   * project filter matching does not allocate strings on every keystroke.
   */
  projectKey: string;
  /**
   * Lowercased concatenation of name + project + branch + summary, joined by
   * "\n". Used as the haystack for search queries so each filter pass runs
   * one `includes()` per session instead of four `.toLowerCase().includes()`
   * calls. Built once at parse time.
   */
  searchHaystack: string;
  /**
   * True when a live PID file under `~/.claude/sessions/` references this
   * session and the recorded PID still names a running process. Drives the
   * green "live" dot in the session list. Undefined / false = no signal.
   */
  isLive?: boolean;
  /**
   * CLI-reported lifecycle status from the PID file (e.g. "busy", "idle").
   * Passed through verbatim — the webview maps known values to dot
   * variants and falls back to the default style for unknown strings so
   * new CLI states surface without an extension update. Undefined when
   * the session is not live or the CLI did not emit a status field.
   */
  status?: string;
  /**
   * Heartbeat timestamp (ms epoch) the CLI last wrote into the PID file.
   * 0/undefined when absent (older CLIs or non-live sessions). Used by
   * the webview to dim the dot once the heartbeat goes stale and by the
   * host to drive incremental UI updates without a full reparse.
   */
  liveUpdatedAt?: number;
}

/** A session with a page of its message transcript loaded. */
export interface SessionDetail extends Session {
  /** Conversation messages for the current page (first or last N) */
  messages: Message[];
  /** Total messages across the entire session (for toggle visibility) */
  totalMessages?: number;
  /** Which page is loaded: "first" (earliest) or "last" (most recent) */
  detailMode?: "first" | "last";
  /**
   * Echo of the query string used when producing this detail. When
   * non-empty, `messages` contains every match across the whole
   * session (paging is bypassed) and `totalMatches` is populated.
   * Webview uses the echo to drop stale replies when the user keeps
   * typing faster than the host can respond.
   */
  detailQuery?: string;
  /** Number of messages matching `detailQuery`. Absent when no query. */
  totalMatches?: number;
  /**
   * Session-wide token totals summed across every assistant message,
   * not just the current page. Absent when the transcript has no
   * usage metadata (very old sessions pre-usage bucket).
   */
  totalUsage?: MessageUsage;
  /**
   * Count of tool invocations across the entire session — sums each
   * message's toolUses length. Helpful companion to totalMessages in
   * the Info row.
   */
  totalToolUses?: number;
}

/**
 * A named tool invocation recorded in an assistant message. Summarised
 * for display — we pick one short `arg` string from the tool input
 * (path / command / pattern) rather than dumping the whole JSON.
 * Kept flat so detail-view rendering stays a single-line row per call.
 */
export interface ToolUseBlock {
  /** Tool name: "Read", "Edit", "Bash", etc. */
  name: string;
  /** Short argument preview — e.g. file path or command. Empty = no hint. */
  arg: string;
}

/**
 * Per-message token accounting. Only set on assistant messages since
 * user messages don't carry usage. All four fields map 1:1 to the
 * Claude API's `usage.*_tokens` shape so totals add up.
 */
export interface MessageUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

/** A single message in a session transcript. */
export interface Message {
  /** Who sent the message */
  role: "user" | "assistant";
  /** Plain text content (text + tool_result chunks concatenated). */
  content: string;
  /** ISO timestamp string from the JSONL entry */
  timestamp: string;
  /**
   * Tool invocations embedded in this message's content array.
   * Non-empty only for assistant messages that called tools. Order
   * matches the order they appear in the JSONL content blocks.
   */
  toolUses?: ToolUseBlock[];
  /**
   * Extended-thinking text from assistant messages that used the
   * thinking API. Concatenated if multiple thinking blocks exist.
   * Empty string / undefined when absent — detail view treats both
   * the same.
   */
  thinking?: string;
  /**
   * Assistant-message token counts. Matches Claude API usage shape.
   * User messages leave this undefined.
   */
  usage?: MessageUsage;
  /** Model id for assistant messages ("claude-opus-4-7", etc.). */
  model?: string;
}

// ── Grouping & Statistics ──

/** A group of sessions under a date label (e.g. "Today", "This Week"). */
export interface SessionGroup {
  /** Display label for the group */
  label: string;
  /** Sessions belonging to this group, sorted by endTime descending */
  sessions: Session[];
}

/** Aggregate statistics across a set of sessions. */
export interface Stats {
  /** Total number of sessions */
  totalSessions: number;
  /** Number of distinct projects */
  totalProjects: number;
  /** Sessions active in the last 7 days */
  thisWeek: number;
  /** Sum of all messageCount values */
  totalMessages: number;
}

// ── JSONL File Entries ──

/** A single line from ~/.claude/history.jsonl. */
export interface HistoryEntry {
  /** The prompt text shown in history */
  display: string;
  /** Pasted file contents, if any */
  pastedContents?: Record<string, unknown>;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Absolute project path */
  project: string;
  /** Session identifier */
  sessionId: string;
}

/** A single line from a per-session .jsonl file in ~/.claude/projects/. */
export interface SessionEntry {
  /** Parent message UUID for threading */
  parentUuid?: string | null;
  /** Whether this entry is from a sidechain (forked conversation) */
  isSidechain?: boolean;
  /** Entry type (e.g. "file-history-snapshot") */
  type?: string;
  /** The message payload */
  message?: {
    role: string;
    /**
     * Either a plain string (legacy user prompts) or a rich array of
     * content blocks. Known block types:
     *  - `text` — plain prose via `text` field
     *  - `thinking` — extended-thinking prose via `thinking` field
     *  - `tool_use` — tool call; `name` + `input` describe the call
     *  - `tool_result` — tool's return value; `content` may be text
     *    or a nested array of text blocks
     */
    content:
      | string
      | Array<{
          type: string;
          text?: string;
          thinking?: string;
          name?: string;
          input?: unknown;
          content?: unknown;
        }>;
    /**
     * Assistant-message usage bucket. Present on every assistant
     * message Claude writes; absent on user messages. Cache fields
     * may be zero when no caching happened.
     */
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    /** Model id ("claude-opus-4-7"). Only on assistant messages. */
    model?: string;
  };
  /** Unique message identifier */
  uuid?: string;
  /** ISO timestamp string */
  timestamp?: string;
  /** Session identifier */
  sessionId?: string;
  /** Working directory at time of message */
  cwd?: string;
  /** Git branch at time of message */
  gitBranch?: string;
  /** Claude CLI version */
  version?: string;
}

// ── Extension <-> Webview Messages ──

/** Messages sent from the extension host to the webview. */
export type ExtensionMessage =
  | { type: "sessions"; data: SessionGroup[]; stats: Stats }
  | { type: "sessionDetail"; data: SessionDetail }
  | { type: "projects"; data: string[] }
  | { type: "workspacePath"; data: string }
  /**
   * Current git branch of the workspace, resolved via the VS Code Git
   * extension. Empty string when no repo is open or the Git extension is
   * unavailable — the webview hides the "This Branch" filter in that case.
   */
  | { type: "workspaceBranch"; data: string }
  | { type: "userState"; pinned: string[]; deleted: string[]; renames: Record<string, string> }
  | { type: "navigateList" }
  | { type: "error"; message: string }
  /**
   * Reply to a `searchFullText` request. `query` echoes back the input so the
   * webview can ignore stale replies for a query the user has since changed.
   * `ids` are session IDs whose transcript content matched.
   */
  | { type: "fullTextResults"; query: string; ids: string[] }
  /**
   * Sent after a `reloadAll` round-trip finishes (or after the
   * `claudeManager.reload` command runs). The webview clears its
   * browser-side caches (quota cache, full-text result echoes) and
   * may flash a transient "Reloaded" acknowledgement.
   */
  | { type: "reloadComplete" };

/** Messages sent from the webview to the extension host. */
export type WebviewMessage =
  | { type: "ready" }
  | { type: "refresh" }
  /**
   * Webview signals it has shown the cinematic intro for the first
   * time. Host persists the flag in globalState so the intro never
   * auto-plays again on this VS Code install.
   */
  | { type: "markDemoSeen" }
  | { type: "continueLastSession" }
  | { type: "getSessionDetail"; sessionId: string; mode?: "first" | "last"; query?: string }
  | { type: "search"; query: string }
  | { type: "filter"; project?: string; branch?: string; dateRange?: [number, number] }
  | { type: "resumeSession"; sessionId: string; entrypoint?: string; projectPath?: string }
  | { type: "resumeMultiple"; sessionIds: string[]; projectPaths?: string[] }
  | { type: "viewTerminal"; sessionId: string }
  | { type: "newSession" }
  | { type: "newTempSession" }
  | { type: "openProject"; projectPath: string }
  | { type: "forkSession"; sessionId: string }
  | { type: "pinSession"; sessionId: string }
  | { type: "unpinSession"; sessionId: string }
  | { type: "deleteSession"; sessionId: string }
  | { type: "renameSession"; sessionId: string }
  | { type: "confirmDelete"; sessionId: string; callback?: string }
  | { type: "copyCommand"; sessionId: string }
  | { type: "copyMarkdown"; sessionId: string }
  | { type: "exportSession"; sessionId: string }
  | { type: "importSession" }
  | { type: "openUrl"; url: string }
  | { type: "getSkills" }
  | { type: "getSkillDetail"; skillId: string }
  | { type: "openSkillFile"; skillPath: string }
  | { type: "deleteSkill"; skillPath: string }
  | { type: "getCommands" }
  | { type: "openCommandFile"; path: string }
  | { type: "getHooks" }
  | { type: "getMcpServers" }
  | { type: "openMcpConfig"; scope: string }
  | { type: "toggleMcpServer"; name: string; scope: string; disabled: boolean }
  | { type: "deleteMcpServer"; name: string; scope: string }
  | { type: "getAgents" }
  | { type: "openAgentFile"; path: string }
  | { type: "openFile"; path: string }
  | { type: "openExtensionSettings" }
  | { type: "getAccountData" }
  | { type: "launchSlash"; command: string }
  | { type: "setModel"; model: string }
  | { type: "setVoiceEnabled"; value: boolean }
  | { type: "setCommitAttribution"; value: string }
  | { type: "setPrAttribution"; value: string }
  /**
   * Generic scalar / array settings writer. Covers fields like
   * `permissions.defaultMode`, `includeCoAuthoredBy`, `cleanupPeriodDays`,
   * and `permissions.additionalDirectories` — all written through
   * writeSettingsValue with dotted keys. Kept generic so adding a
   * new Claude Code setting doesn't require a new message variant
   * per field.
   */
  | { type: "setSetting"; key: string; value: unknown; scope?: "global" | "project" | "local" }
  /**
   * Open a native input box for an additional-directory path and
   * append it to `permissions.additionalDirectories` in settings.json.
   * Host validates the path and rejects duplicates before writing.
   */
  | { type: "promptAddDirectory" }
  /**
   * Confirm-before-delete wrapper around `removePermission`. Host
   * shows a modal; on confirm, performs the removal + echoes fresh
   * accountData. Stops one-click data loss on mis-tapped remove
   * buttons in the Permissions list.
   */
  | { type: "promptRemovePermission"; scope: "global" | "project" | "local"; tool: string; list: "allow" | "deny" }
  /**
   * Back up `settings.json` to a `.bak-<epoch>` sibling, clearing the
   * live file so Claude CLI regenerates sane defaults on next start.
   * Reversible via the backup.
   */
  | { type: "resetSettings"; scope: "global" | "project" | "local" }
  /**
   * Trigger a VS Code command from the webview — generic escape hatch
   * for actions that already exist as commands (Brain export/import,
   * future command-palette entries). Host dispatches via
   * `vscode.commands.executeCommand(msg.command)`.
   */
  | { type: "runCommand"; command: string }
  | { type: "openSettingsFile"; scope: "global" | "project" | "local" }
  | { type: "addPermission"; scope: "global" | "project" | "local"; tool: string; list: "allow" | "deny" }
  | { type: "removePermission"; scope: "global" | "project" | "local"; tool: string; list: "allow" | "deny" }
  | { type: "promptAddPermission"; scope: "global" | "project" | "local"; list: "allow" | "deny" }
  | { type: "promptCustomModel" }
  | { type: "restoreClaudeConfig" }
  /**
   * Read the latest quota + live-session snapshot from the local
   * statusline cache (no network call). Sent on mount, on account
   * switch, and on the user's Refresh. Extension replies with a
   * `quotaData` message carrying either data or a typed error.
   */
  | { type: "fetchQuota" }
  /**
   * Wire / unwire Claude Code's `statusLine.command` to our tap so it
   * caches the server-computed quota locally. Opt-in (the user clicks
   * "Enable live quota"); uninstall restores their prior statusline.
   */
  | { type: "installStatusline" }
  | { type: "uninstallStatusline" }
  /**
   * Accounts section — manage saved profile snapshots under
   * ~/.claude/manager-accounts/<slug>/. Ask the host to pop a native
   * VS Code input box for the profile label, then save if the user
   * submits. Invoked from the Profile section's "Save profile" button;
   * the host replies with a refreshed `accountData` so the webview
   * re-renders with the latest list + active marker.
   */
  | { type: "promptSaveProfile" }
  /**
   * Open the native QuickPick account switcher — lists saved profiles
   * with item buttons for Switch / Update / Remove, plus entries for
   * "Log in as a new account" and "Save current account". Single
   * entry point replacing the standalone Accounts section UI. The
   * Switch/Update/Remove actions run inside the QuickPick handler
   * (accountSwitcher.ts), not via dedicated webview messages.
   */
  | { type: "openAccountSwitcher" }
  /**
   * Search inside session transcripts (content of every message), not just
   * metadata. The extension replies with matching IDs via `fullTextResults`.
   * Metadata search still runs client-side on `searchHaystack`; these two
   * result sets are unioned in the webview.
   */
  | { type: "searchFullText"; query: string }
  /**
   * Open a chat tab with the given prompt pre-filled. Used by the
   * Commands tab ("Launch in Chat"), Skills tab, and the "Ask Again"
   * action on session-detail prompts.
   */
  | { type: "launchChatWithPrompt"; prompt: string }
  /**
   * Open a project folder and then fire the chat URI handler in the new
   * window. Intended for the "Open Project + New Chat" action.
   */
  | { type: "openProjectAndChat"; projectPath: string }
  /**
   * Bulk-pin (or unpin) every id in the array. Single round-trip
   * keeps the userState reply atomic — without batching, N
   * `pinSession` calls fire N reply messages and the UI flickers.
   */
  | { type: "bulkPinSessions"; ids: string[]; pin: boolean }
  /**
   * Bulk-delete with a single host-side confirm modal. The host
   * shows the count, then loops `deleteSession` and emits one
   * userState reply.
   */
  | { type: "bulkDeleteSessions"; ids: string[] }
  /**
   * Bulk-export selected sessions as a single .zip with a
   * manifest. Host opens a save dialog, gathers each session's
   * jsonl from disk, zips them with a `manifest.json`, and writes
   * the archive.
   */
  | { type: "bulkExportSessions"; ids: string[] }
  /**
   * Restore the live settings.json for a scope from a saved
   * snapshot. Host shows a confirm modal before overwriting; the
   * snapshot module makes a fresh snapshot of the *current* live
   * file first so the restore is itself reversible.
   */
  | {
      type: "restoreSettingsSnapshot";
      scope: "global" | "project" | "local";
      snapshotId: string;
    }
  /**
   * Permanently delete a single settings snapshot. Host shows a
   * brief confirm; no recovery beyond that.
   */
  | {
      type: "deleteSettingsSnapshot";
      scope: "global" | "project" | "local";
      snapshotId: string;
    }
  /**
   * Force a full re-parse + re-post of every tab's data without
   * recreating the webview. Triggered by the toolbar refresh icon and
   * by the `claudeManager.reload` command palette entry — both routes
   * end up in `ClaudeSessionViewProvider.reloadAll()`.
   */
  | { type: "reloadAll" }
  /**
   * Hooks-feature messages routed through the same webview channel.
   * Their definitions live in `../hooks/types` so the hooks feature
   * owns its own protocol shape; we reference the union here so the
   * shared dispatcher in `viewProvider.ts` narrows correctly.
   */
  | HooksWebviewMessage;
