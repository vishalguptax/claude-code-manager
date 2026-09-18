/**
 * Host-side mirror of the webview's error log, plus the output channel the
 * user can actually open and copy from.
 *
 * The webview's own log dies with the panel, and its console is behind
 * "Developer: Open Webview Developer Tools" — a command most users have never
 * heard of. Every failure the webview reports is written here instead, where
 * it lands in Output → Claude Code Manager and in VS Code's own log files, so
 * a bug report can be assembled after the fact rather than only in the moment.
 *
 * The channel is created lazily: an extension that never errors should not add
 * an empty entry to the user's Output dropdown.
 */
import * as vscode from "vscode";

export interface LoggedError {
  at: number;
  source: string;
  message: string;
  stack?: string;
}

/** Bounded for the same reason the webview's log is: a crash can repeat. */
const MAX_ENTRIES = 50;

const entries: LoggedError[] = [];

let channel: vscode.OutputChannel | undefined;

/** The shared output channel, created on first use. */
export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel("Claude Code Manager");
  return channel;
}

/** One line per entry, with the stack indented beneath it when there is one. */
export function formatEntry(entry: LoggedError): string {
  const when = new Date(entry.at).toISOString();
  const head = `[${when}] [${entry.source}] ${entry.message}`;
  return entry.stack ? `${head}\n${entry.stack}` : head;
}

/** Record a failure reported by the webview (or raised host-side). */
export function recordError(entry: LoggedError): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  getOutputChannel().appendLine(formatEntry(entry));
}

/** Everything recorded this session, oldest first. */
export function getErrors(): readonly LoggedError[] {
  return entries;
}

/** Render the whole log for a bug report. */
export function formatErrors(log: readonly LoggedError[] = entries): string {
  if (log.length === 0) return "No errors recorded this session.";
  return log.map(formatEntry).join("\n\n");
}

/** Test-only: drop the entries and the cached channel. */
export function _resetErrorLog(): void {
  entries.length = 0;
  channel = undefined;
}
