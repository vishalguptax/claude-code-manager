/**
 * Full-text session search index.
 *
 * Session JSONL files live under ~/.claude/projects/<slug>/<id>.jsonl
 * and can easily reach 50 MB per session. Loading every transcript into
 * the webview for a client-side match would blow both memory and the
 * postMessage payload limit. Instead we keep a compact searchable
 * string per session in the extension host — lowercased text content
 * only, capped per session and bounded in total (see the constants below).
 *
 * The cache is populated lazily (after the first parseSessions call)
 * and updated incrementally: when a single session file changes, only
 * that session is re-extracted — not the whole corpus.
 *
 * Search itself is plain substring match (`includes`) on the already-
 * lowercased content, plus a streaming tail scan for the rare session
 * whose text exceeds the per-session cap — so a match is never missed
 * just because the session is long.
 */
import * as fs from "fs";
import { LRU } from "../../core/lru";
import type { SessionEntry } from "./types";

/**
 * Cap per-session indexed text. Sessions past this are indexed up to the cap
 * and their remainder is searched on demand (see {@link scanTail}), so the cap
 * bounds *memory*, never *correctness*.
 *
 * History: 50 KB, then 150 KB. Both silently dropped most of a long session's
 * text — measured on a real corpus, 21% of sessions exceeded 150 KB and the
 * worst had only 11% of its text indexed, so a keyword the user could see in
 * the transcript returned nothing. That reads as "search is broken", which it
 * effectively was. 2 MB covers every session in that corpus outright; the tail
 * scan covers anything beyond it.
 */
const MAX_CONTENT_CHARS = 2 * 1024 * 1024;

/** Bytes to read per JSONL chunk while streaming — same tuning as parseJsonlFile. */
const READ_CHUNK = 64 * 1024;

/**
 * Hard ceiling on indexed sessions, independent of size. A secondary guard:
 * with the character budget below doing the real work, this only bounds
 * per-entry bookkeeping overhead for installs with thousands of sessions.
 */
const INDEX_MAX_ENTRIES = 2000;

/**
 * Total indexed characters held across every entry. This — not the
 * per-session cap — is what bounds index memory: raising MAX_CONTENT_CHARS to
 * 2 MB would allow 2000 × 2 MB with an entry-count bound alone, so the budget
 * evicts least-recently-used sessions until the total fits. At ~85 KB of
 * extracted text per session (real-corpus average) 256M characters holds
 * roughly 3000 sessions fully indexed.
 *
 * Known limit: an evicted session has no entry, so it is skipped by search
 * entirely — the tail scan only covers sessions that ARE indexed. Past ~3000
 * sessions the coldest ones stop matching. Not addressed here because it needs
 * a persisted on-disk index to fix properly, and the alternative (an entry
 * stub per evicted session, tail-scanned on demand) trades that silence for a
 * search that streams thousands of files.
 */
const INDEX_MAX_CHARS = 256 * 1024 * 1024;

/**
 * sessionId -> { mtimeMs of the source file, lowercased searchable
 * content }. Module-scoped singleton.
 *
 * Storing mtime alongside the content lets indexSession() skip the
 * extract step when the file hasn't changed since the last build.
 * Without this, every parseSessions() tick re-streamed every JSONL
 * even when only one session had been touched.
 *
 * Backed by an LRU for its recency ordering only — its own size eviction is
 * disabled (unbounded `max`) because it would drop entries without telling us,
 * leaving the character accounting below permanently over-counted. Both bounds
 * are enforced by {@link trimIndex} instead. `indexSession` (set) and
 * `searchContent` (get) promote on access, so the hot working set survives
 * eviction and only cold sessions are dropped under pressure.
 */
interface IndexEntry {
  mtimeMs: number;
  content: string;
  /**
   * True when the per-session cap cut extraction short, so `tailOffset` marks
   * un-indexed text that `searchContent` must scan on demand. A separate flag
   * rather than `tailOffset > 0`: a session whose very first message overflows
   * the cap resumes at offset 0, which that test would read as "complete".
   */
  truncated: boolean;
  /** File offset just past the last indexed line. Meaningful when truncated. */
  tailOffset: number;
  /** Source path, kept so the tail scan can reopen the file without a lookup. */
  filePath: string;
}
const index = new LRU<string, IndexEntry>(Number.POSITIVE_INFINITY);

/**
 * Running sum of `content.length` across every live entry. Maintained by
 * {@link setEntry} / {@link dropEntry} rather than recomputed, since the
 * budget is checked on every insert during a full index build.
 */
let indexedChars = 0;

/** Insert (or replace) an entry, keeping the character accounting exact. */
function setEntry(sessionId: string, entry: IndexEntry): void {
  const prev = index.peek(sessionId);
  if (prev) indexedChars -= prev.content.length;
  index.set(sessionId, entry);
  indexedChars += entry.content.length;
  trimIndex();
}

/** Remove an entry, keeping the character accounting exact. */
function dropEntry(sessionId: string): void {
  const prev = index.peek(sessionId);
  if (!prev) return;
  indexedChars -= prev.content.length;
  index.delete(sessionId);
}

/**
 * Evict least-recently-used entries until the index fits both bounds.
 * `peek` (not `get`) reads the victim inside dropEntry — `get` would promote
 * it to most-recently-used and make the loop spin on the same entry forever.
 */
function trimIndex(): void {
  while (indexedChars > INDEX_MAX_CHARS || index.size > INDEX_MAX_ENTRIES) {
    const oldest = index.keys().next();
    if (oldest.done) break;
    dropEntry(oldest.value);
  }
}

/** Text extracted from a session file, plus where to resume if it was cut short. */
interface Extracted {
  content: string;
  /** True when the cap stopped extraction before the end of the file. */
  truncated: boolean;
  /** File offset just past the last line folded into `content`. */
  tailOffset: number;
}

/**
 * Extract lowercased, search-friendly text from a session's JSONL file,
 * starting at `startOffset`. We skip tool-use / tool-result blocks (they're
 * usually file paths and JSON noise) and keep plain user + assistant text
 * content only. The file is read in chunks so a 50 MB session never sits in
 * memory all at once — we stop as soon as the running content buffer hits
 * MAX_CONTENT_CHARS and report the offset to resume from.
 *
 * The resume offset is tracked line by line so it lands exactly after the
 * line that overflowed the cap. Resuming at the enclosing chunk's start would
 * be simpler but re-reads that line, and a single message larger than the cap
 * makes that "chunk" the whole file — turning every tail scan into a full
 * re-read of a 50 MB transcript.
 *
 * Returns empty content if the file is missing or unreadable — callers treat
 * that as "no content to search."
 */
function extractContent(filePath: string, startOffset = 0): Extracted {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return { content: "", truncated: false, tailOffset: 0 };
  }

  const parts: string[] = [];
  let charsSoFar = 0;
  const buf = Buffer.alloc(READ_CHUNK);
  let leftover = "";
  let bytesRead: number;
  let pos = startOffset;
  // Offset of the next unconsumed line. Starts as the leftover's own start,
  // since the leftover is the beginning of a line carried across a read.
  let lineOffset = startOffset;
  let truncated = false;

  try {
    do {
      bytesRead = fs.readSync(fd, buf, 0, READ_CHUNK, pos);
      if (bytesRead === 0) break;
      pos += bytesRead;
      const chunk = leftover + buf.toString("utf-8", 0, bytesRead);
      const lines = chunk.split("\n");
      leftover = lines.pop() ?? "";
      for (const line of lines) {
        lineOffset += Buffer.byteLength(line) + 1; // + the "\n" we split on
        if (!line.trim()) continue;
        const text = extractLineText(line);
        if (!text) continue;
        parts.push(text);
        charsSoFar += text.length + 1;
        if (charsSoFar >= MAX_CONTENT_CHARS) break;
      }
      if (charsSoFar >= MAX_CONTENT_CHARS) {
        truncated = true;
        break;
      }
    } while (bytesRead === READ_CHUNK);

    if (!truncated && leftover.trim()) {
      const text = extractLineText(leftover);
      if (text) parts.push(text);
    }
  } finally {
    fs.closeSync(fd);
  }

  return {
    content: parts.join("\n").toLowerCase().slice(0, MAX_CONTENT_CHARS),
    truncated,
    tailOffset: lineOffset,
  };
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
    const { content, truncated, tailOffset } = extractContent(filePath);
    setEntry(sessionId, { mtimeMs: 0, content, truncated, tailOffset, filePath });
    return;
  }
  const cached = index.get(sessionId);
  if (cached && cached.mtimeMs === mtimeMs) return;
  const { content, truncated, tailOffset } = extractContent(filePath);
  setEntry(sessionId, { mtimeMs, content, truncated, tailOffset, filePath });
}

/**
 * Drop every indexed entry. Used by the global reload so the next
 * `buildSearchIndex` re-extracts content for every session from scratch
 * (the routine mtime gate is bypassed because there is nothing to gate
 * against). Targeted refreshes still go through {@link pruneIndex}.
 */
export function clearIndex(): void {
  index.clear();
  indexedChars = 0;
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
    if (!activeIds.has(id)) dropEntry(id);
  }
}

/** Entries scanned between event-loop yields during a full-text search. */
const SEARCH_SCAN_YIELD_EVERY = 256;

/**
 * Stream the un-indexed remainder of one session file looking for `q`
 * (already lowercased). Used only for sessions whose text exceeded
 * MAX_CONTENT_CHARS, so the common case never pays for it.
 *
 * Nothing is retained: one 64 KB buffer plus the partial line carried between
 * reads. That `leftover` is what makes chunking safe — a message longer than a
 * chunk is reassembled before matching, so a keyword is never split across two
 * reads. Matching stays within one message, exactly as it does against the
 * in-memory index (both join messages with "\n" so a query cannot span them).
 */
async function scanTail(filePath: string, startOffset: number, q: string): Promise<boolean> {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return false;
  }

  const buf = Buffer.alloc(READ_CHUNK);
  let leftover = "";
  let pos = startOffset;
  let bytesRead: number;

  try {
    do {
      bytesRead = fs.readSync(fd, buf, 0, READ_CHUNK, pos);
      if (bytesRead === 0) break;
      pos += bytesRead;
      const chunk = leftover + buf.toString("utf-8", 0, bytesRead);
      const lines = chunk.split("\n");
      leftover = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const text = extractLineText(line);
        if (text && text.toLowerCase().includes(q)) return true;
      }
      // Yield between chunks: a multi-megabyte tail must not block the host
      // while the user is still typing.
      await new Promise<void>((resolve) => setImmediate(resolve));
    } while (bytesRead === READ_CHUNK);

    if (leftover.trim()) {
      const text = extractLineText(leftover);
      if (text && text.toLowerCase().includes(q)) return true;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Return the session IDs whose content matches the query. The query
 * is lowercased before matching since the index is pre-lowered.
 * Empty or whitespace-only queries return an empty list — callers
 * decide what "no query" means in their UX.
 *
 * Two passes: every entry's indexed content first (fast, in memory), then the
 * un-indexed tail of any capped session that did not already match. The second
 * pass is what makes a long session searchable to its end; it touches disk, so
 * it runs only for the sessions that need it and only after the cheap pass has
 * ruled them out.
 */
export async function searchContent(query: string): Promise<string[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  // Snapshot the entries (id + content refs — no string copies, so cheap) so
  // the scan is stable even if the background indexer mutates the LRU while we
  // yield. entries() is non-promoting; matched ids are promoted afterwards via
  // index.get() so a session the user keeps searching for survives eviction.
  const snapshot = [...index.entries()];
  const hits: string[] = [];
  const tails: Array<[string, IndexEntry]> = [];
  for (let i = 0; i < snapshot.length; i++) {
    const [id, entry] = snapshot[i];
    if (entry.content.includes(q)) hits.push(id);
    else if (entry.truncated) tails.push([id, entry]);
    // Yield periodically so a large index does not monopolise the event loop
    // mid-search on a heavy install.
    if (i > 0 && i % SEARCH_SCAN_YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  for (const [id, entry] of tails) {
    if (await scanTail(entry.filePath, entry.tailOffset, q)) hits.push(id);
  }
  for (const id of hits) index.get(id);
  return hits;
}

/** Indexed character total. Exported for tests asserting the memory budget. */
export function indexedCharCount(): number {
  return indexedChars;
}
