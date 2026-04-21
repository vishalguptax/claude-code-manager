/**
 * Type definitions for the sessions feature.
 * Covers session data, grouping, statistics, JSONL entries, and message protocol.
 */

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
}

/** A session with a page of its message transcript loaded. */
export interface SessionDetail extends Session {
  /** Conversation messages for the current page (first or last N) */
  messages: Message[];
  /** Total messages across the entire session (for toggle visibility) */
  totalMessages?: number;
  /** Which page is loaded: "first" (earliest) or "last" (most recent) */
  detailMode?: "first" | "last";
}

/** A single message in a session transcript. */
export interface Message {
  /** Who sent the message */
  role: "user" | "assistant";
  /** Plain text content */
  content: string;
  /** ISO timestamp string from the JSONL entry */
  timestamp: string;
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
    content: string | Array<{ type: string; text?: string; thinking?: string }>;
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
  | { type: "fullTextResults"; query: string; ids: string[] };

/** Messages sent from the webview to the extension host. */
export type WebviewMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "continueLastSession" }
  | { type: "getSessionDetail"; sessionId: string; mode?: "first" | "last" }
  | { type: "search"; query: string }
  | { type: "filter"; project?: string; branch?: string; dateRange?: [number, number] }
  | { type: "resumeSession"; sessionId: string; entrypoint?: string; projectPath?: string }
  | { type: "resumeMultiple"; sessionIds: string[]; projectPaths?: string[] }
  | { type: "newSession" }
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
  | { type: "openAccountUrl"; url: string }
  | { type: "launchSlash"; command: string }
  | { type: "setModel"; model: string }
  | { type: "setVoiceEnabled"; value: boolean }
  | { type: "setCommitAttribution"; value: string }
  | { type: "setPrAttribution"; value: string }
  | { type: "openSettingsFile"; scope: "global" | "project" | "local" }
  | { type: "addPermission"; scope: "global" | "project" | "local"; tool: string; list: "allow" | "deny" }
  | { type: "removePermission"; scope: "global" | "project" | "local"; tool: string; list: "allow" | "deny" }
  | { type: "promptAddPermission"; scope: "global" | "project" | "local"; list: "allow" | "deny" }
  | { type: "promptCustomModel" }
  | { type: "restoreClaudeConfig" }
  /**
   * Opt-in network call to the Anthropic OAuth quota endpoint.
   * Triggered only by the user clicking "Refresh" on the Quota card,
   * never automatically. Extension replies with a `quotaData` message.
   */
  | { type: "fetchQuota" }
  /**
   * Accounts section — manage saved profile snapshots under
   * ~/.claude/manager-accounts/<slug>/. Each command sends a
   * refreshed `accountData` reply so the webview re-renders with the
   * latest list + active marker.
   */
  | { type: "saveProfile"; label: string }
  /**
   * Ask the host to pop a native VS Code input box for the profile
   * label, then save if the user submits. Invoked from the Profile
   * section's "Save profile" button.
   */
  | { type: "promptSaveProfile" }
  /**
   * Open the native QuickPick account switcher — lists saved profiles
   * with item buttons for Switch / Update / Remove, plus entries for
   * "Log in as a new account" and "Save current account". Single
   * entry point replacing the standalone Accounts section UI.
   */
  | { type: "openAccountSwitcher" }
  | { type: "switchProfile"; slug: string }
  | { type: "updateProfile"; slug: string }
  | { type: "removeProfile"; slug: string }
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
  | { type: "openProjectAndChat"; projectPath: string };
