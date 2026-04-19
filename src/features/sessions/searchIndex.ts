/**
 * Full-text session search index.
 *
 * Session JSONL files live under ~/.claude/projects/<slug>/<id>.jsonl
 * and can easily reach 50 MB per session. Loading every transcript into
 * the webview for a client-side match would blow both memory and the
 * postMessage payload limit. Instead we keep a compact searchable
 * string per session in the extension host — lowercased text content
 * only, capped at MAX_CONTENT_BYTES so total memory stays bounded.
 *
 * The cache is populated lazily (after the first parseSessions call)
 * and updated incrementally: when a single session file changes, only
 * that session is re-extracted — not the whole corpus.
 *
 * Search itself is plain substring match (`includes`) on the already-
 * lowercased content. With a typical cap of 50 KB × 5000 sessions =
 * 250 MB of content, a full scan is ~500 ms on a modern machine. In
 * practice session content averages <10 KB after extraction (most of
 * the JSONL is tool-call metadata we skip), so scans are well under
 * 100 ms even at that scale.
 */
import * as fs from "fs";
import type { SessionEntry } from "./types";

/** Cap per-session content to keep total memory bounded. */
const MAX_CONTENT_BYTES = 50 * 1024;

/** Bytes to read per JSONL chunk while streaming — same tuning as parseJsonlFile. */
const READ_CHUNK = 64 * 1024;

/** sessionId -> lowercased searchable content. Module-scoped singleton. */
const index = new Map<string, string>();

/**
 * Extract lowercased, search-friendly text from a single session's
 * JSONL file. We skip tool-use / tool-result blocks (they're usually
 * file paths and JSON noise) and keep plain user + assistant text
 * content only. The file is read in chunks so a 50 MB session never
 * sits in memory all at once — we drop chunks as soon as the running
 * content buffer hits MAX_CONTENT_BYTES.
 *
 * Returns an empty string if the file is missing or unreadable —
 * callers treat that as "no content to search."
 */
function extractContent(filePath: string): string {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return "";
  }

  const parts: string[] = [];
  let bytesSoFar = 0;
  const buf = Buffer.alloc(READ_CHUNK);
  let leftover = "";
  let bytesRead: number;

  try {
    do {
      bytesRead = fs.readSync(fd, buf, 0, READ_CHUNK, null);
      if (bytesRead === 0) break;
      const chunk = leftover + buf.toString("utf-8", 0, bytesRead);
      const lines = chunk.split("\n");
      leftover = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const text = extractLineText(line);
        if (!text) continue;
        parts.push(text);
        bytesSoFar += text.length + 1;
        if (bytesSoFar >= MAX_CONTENT_BYTES) break;
      }
      if (bytesSoFar >= MAX_CONTENT_BYTES) break;
    } while (bytesRead === READ_CHUNK);

    if (bytesSoFar < MAX_CONTENT_BYTES && leftover.trim()) {
      const text = extractLineText(leftover);
      if (text) parts.push(text);
    }
  } finally {
    fs.closeSync(fd);
  }

  return parts.join("\n").toLowerCase().slice(0, MAX_CONTENT_BYTES);
}

/**
 * Pull user/assistant text out of one JSONL line. Returns empty string
 * for metadata entries (permission-mode, file-history-snapshot, etc.)
 * or when the line fails to parse (expected at chunk boundaries —
 * partial JSON gets dropped, the next chunk picks it up).
 */
function extractLineText(line: string): string {
  let entry: SessionEntry;
  try {
    entry = JSON.parse(line) as SessionEntry;
  } catch {
    return "";
  }

  const role = entry.message?.role;
  if (role !== "user" && role !== "assistant") return "";
  if (entry.isSidechain) return "";
  if (entry.type === "file-history-snapshot") return "";

  const content = entry.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b.text === "string" ? b.text : ""))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

/**
 * Index a single session's file. Called from the chunked index build
 * scheduled by viewProvider after each parseSessions().
 */
export function indexSession(sessionId: string, filePath: string): void {
  index.set(sessionId, extractContent(filePath));
}

/**
 * Reset the whole index. Called at the start of each full rebuild so
 * stale entries from deleted sessions do not leak.
 */
export function clearIndex(): void {
  index.clear();
}

/**
 * Return the session IDs whose content matches the query. The query
 * is lowercased before matching since the index is pre-lowered.
 * Empty or whitespace-only queries return an empty list — callers
 * decide what "no query" means in their UX.
 */
export function searchContent(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: string[] = [];
  for (const [id, text] of index) {
    if (text.includes(q)) hits.push(id);
  }
  return hits;
}
