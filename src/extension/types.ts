export interface Session {
  id: string;
  name: string;           // user-set name (via claude -n) or empty
  project: string;
  projectPath: string;
  branch: string;
  entrypoint: string;     // "cli" | "vscode" | ""
  startTime: number;
  endTime: number;
  messageCount: number;
  summary: string;        // first prompt, truncated
  prompts: string[];
}

export interface SessionDetail extends Session {
  messages: Message[];
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface SessionGroup {
  label: string;
  sessions: Session[];
}

export interface Stats {
  totalSessions: number;
  totalProjects: number;
  thisWeek: number;
  totalMessages: number;
}

// history.jsonl entry
export interface HistoryEntry {
  display: string;
  pastedContents?: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId: string;
}

// per-session .jsonl entry
export interface SessionEntry {
  parentUuid?: string | null;
  isSidechain?: boolean;
  type?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string; thinking?: string }>;
  };
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
}

// Messages between extension <-> webview
export type ExtensionMessage =
  | { type: "sessions"; data: SessionGroup[]; stats: Stats }
  | { type: "sessionDetail"; data: SessionDetail }
  | { type: "projects"; data: string[] }
  | { type: "workspacePath"; data: string }
  | { type: "userState"; pinned: string[]; deleted: string[] }
  | { type: "error"; message: string };

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
  | { type: "confirmDelete"; sessionId: string; callback?: string }
  | { type: "copyCommand"; sessionId: string }
  | { type: "copyMarkdown"; sessionId: string }
  | { type: "openUrl"; url: string };
