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
import { LRU } from "../../core/lru";
import type { SessionEntry } from "./types";

/** Cap per-session content to keep total memory bounded. */
const MAX_CONTENT_BYTES = 50 * 1024;

/** Bytes to read per JSONL chunk while streaming — same tuning as parseJsonlFile. */
const READ_CHUNK = 64 * 1024;

/**
 * Maximum indexed sessions held in memory at once. Each entry caps at
 * MAX_CONTENT_BYTES (50 KB) so 2000 entries bound the index at ~100 MB
 * worst case — a hard ceiling for users with thousands of sessions.
 * The LRU evicts the least-recently-touched session when a 2001st is
 * indexed; an evicted session is silently re-extracted the next time it
 * is indexed or searched against.
 */
const INDEX_MAX_ENTRIES = 2000;

/**
 * sessionId -> { mtimeMs of the source file, lowercased searchable
 * content }. Module-scoped singleton.
 *
 * Storing mtime alongside the content lets indexSession() skip the
 * extract step when the file hasn't changed since the last build.
 * Without this, every parseSessions() tick re-streamed every JSONL
 * even when only one session had been touched.
 *
 * Backed by an LRU so the index can never grow past INDEX_MAX_ENTRIES.
 * `indexSession` (set) and `searchContent` (get) both promote on access,
 * so the hot working set survives eviction and only cold sessions are
 * dropped under pressure.
 */
interface IndexEntry {
  mtimeMs: number;
  content: string;
}
const index = new LRU<string, IndexEntry>(INDEX_MAX_ENTRIES);

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
 * Index a single session's file. No-op when the entry already exists
 * with a matching mtime — re-extracting an unchanged 50MB transcript
 * is the dominant cost of a full rebuild on weak machines, so keeping
 * an mtime gate here turns subsequent rebuilds into stat-only scans
 * for unchanged sessions.
 *
 * On stat failure (file missing) we still call extractContent so a
 * deleted file ends up with empty content — searchContent then
 * returns no matches for that id, which is the user-visible-correct
 * outcome.
 */
export function indexSession(sessionId: string, filePath: string): void {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    index.set(sessionId, { mtimeMs: 0, content: extractContent(filePath) });
    return;
  }
  const cached = index.get(sessionId);
  if (cached && cached.mtimeMs === mtimeMs) return;
  index.set(sessionId, { mtimeMs, content: extractContent(filePath) });
}

/**
 * Drop entries whose ids are not in `activeIds`. Replaces the previous
 * `clearIndex()` semantics: a full rebuild now keeps unchanged-file
 * entries (so indexSession can skip them on the mtime check) and only
 * evicts ids that no longer correspond to a live session — typically
 * sessions the user deleted from the panel.
 */
export function pruneIndex(activeIds: Set<string>): void {
  // Snapshot the keys before mutating — deleting while iterating the
  // backing Map's live key iterator is allowed by spec, but a snapshot
  // keeps intent obvious and is cheap (ids only).
  for (const id of [...index.keys()]) {
    if (!activeIds.has(id)) index.delete(id);
  }
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
  // Scan via entries() (a non-promoting read view) so we don't mutate
  // recency ordering mid-iteration. Matched ids are promoted afterwards
  // via index.get() so a session the user keeps searching for survives
  // eviction as part of the hot working set.
  for (const [id, entry] of index.entries()) {
    if (entry.content.includes(q)) hits.push(id);
  }
  for (const id of hits) index.get(id);
  return hits;
}
