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
}

/** A session with its full message transcript loaded. */
export interface SessionDetail extends Session {
  /** Full conversation messages (user + assistant) */
  messages: Message[];
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
  | { type: "userState"; pinned: string[]; deleted: string[]; renames: Record<string, string> }
  | { type: "navigateList" }
  | { type: "error"; message: string };

/** Messages sent from the webview to the extension host. */
export type WebviewMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "getSessionDetail"; sessionId: string }
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
  | { type: "openFile"; path: string };
