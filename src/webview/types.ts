/** Shared type definitions for the webview. */

export interface VSCodeAPI {
  postMessage(msg: unknown): void;
}

export interface Session {
  id: string;
  name: string;
  project: string;
  projectPath: string;
  branch: string;
  entrypoint: string;
  startTime: number;
  endTime: number;
  messageCount: number;
  summary: string;
  prompts: string[];
}

export interface SessionDetail extends Session {
  messages: { role: "user" | "assistant"; content: string; timestamp: string }[];
}

export interface Stats {
  totalSessions: number;
  totalProjects: number;
  thisWeek: number;
  totalMessages: number;
}

export type DateFilter = "today" | "week" | "month" | "all";

export type View = "list" | "detail";
