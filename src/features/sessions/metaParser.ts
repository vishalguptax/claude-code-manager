/**
 * Session-file metadata extraction.
 *
 * Owns the cheap, bounded reads that turn a transcript .jsonl into the
 * handful of fields a Session card needs (branch, entrypoint, rename,
 * summary, ai-title) without loading multi-MB transcripts into memory:
 *
 * - `getSessionFileIndex` / `getSessionFile`: mtime-cached
 *   `sessionId -> absolute path` lookup over ~/.claude/projects.
 * - `readSessionMeta`: head (~256KB) + tail (~64KB) bounded read,
 *   LRU-cached by (mtime, size).
 * - `parseJsonlFile`: streaming JSONL reader shared by detail + history.
 *
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import {
  PROJECTS_DIR,
  SESSION_META_READ_BYTES,
} from "../../core/config";
import { LRU } from "../../core/lru";

/** Maximum bytes to read from a session file when extracting name hints (rename/summary). */
const NAME_HINT_READ_BYTES = 256 * 1024; // 256 KB — covers most sessions

/** Size of the tail window we read to capture the most recent gitBranch. */
const TAIL_READ_BYTES = 64 * 1024;

/**
 * Upper bound on per-path caches in this module. A heavy user with
 * thousands of sessions would otherwise grow the meta cache unbounded
 * across a long-lived extension host; the LRU caps resident entries and
 * evicts the least-recently-touched paths.
 */
const META_CACHE_MAX = 2000;

/**
 * Cached `sessionId -> absolute file path` map. Rebuilt only when
 * PROJECTS_DIR or any of its subdirectories change mtime. Without
 * this cache every parseSessions() re-walked the projects directory
 * (one readdir + N statSync) even when no session file had moved or
 * been added. With it, an unchanged tree resolves the index in two
 * stat calls (the projects dir itself plus a per-subdir confirmation).
 *
 * Invalidation is mtime-only: an empty/null cache means the next
 * call rebuilds. We do not invalidate by file content — a JSONL
 * line append doesn't add or remove a session file, so the index
 * stays correct.
 */
interface SessionFileIndexCache {
  projectsDirMtimeMs: number;
  subdirMtimes: Map<string, number>;
  index: Map<string, string>;
}
let sessionFileIndex: SessionFileIndexCache | null = null;

/**
 * Return the cached `sessionId -> absolute file path` map, rebuilding it
 * only when PROJECTS_DIR (or any of its subdirectories) has changed
 * mtime since the last build.
 *
 * Why subdir mtime matters: adding or removing a transcript file mutates
 * its parent project subdirectory's mtime — but does NOT touch
 * PROJECTS_DIR itself unless the project subdir is created/removed too.
 * Tracking subdirs catches the common case (new session inside an
 * existing project) without re-walking the whole tree on every call.
 */
export function getSessionFileIndex(): Map<string, string> {
  let projectsStat: fs.Stats;
  try {
    projectsStat = fs.statSync(PROJECTS_DIR);
  } catch {
    // Projects directory missing — keep a stale cache (might be a
    // transient FS hiccup) and fall back to whatever we had. Returning
    // an empty map either way is fine because callers .get() and tolerate
    // null.
    return sessionFileIndex?.index ?? new Map();
  }

  if (sessionFileIndex && sessionFileIndex.projectsDirMtimeMs === projectsStat.mtimeMs) {
    // Top-level mtime unchanged — verify each subdir is also unchanged.
    let allFresh = true;
    for (const [sub, mtime] of sessionFileIndex.subdirMtimes) {
      let st: fs.Stats;
      try {
        st = fs.statSync(sub);
      } catch {
        allFresh = false;
        break;
      }
      if (st.mtimeMs !== mtime) {
        allFresh = false;
        break;
      }
    }
    if (allFresh) return sessionFileIndex.index;
  }

  const index = new Map<string, string>();
  const subdirMtimes = new Map<string, number>();
  let dirs: string[];
  try {
    dirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    sessionFileIndex = {
      projectsDirMtimeMs: projectsStat.mtimeMs,
      subdirMtimes,
      index,
    };
    return index;
  }

  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(dirPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    let files: string[];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      continue;
    }

    subdirMtimes.set(dirPath, stat.mtimeMs);
    for (const file of files) {
      if (file.endsWith(".jsonl")) {
        index.set(file.slice(0, -6), path.join(dirPath, file));
      }
    }
  }

  sessionFileIndex = {
    projectsDirMtimeMs: projectsStat.mtimeMs,
    subdirMtimes,
    index,
  };
  return index;
}

/**
 * Look up the JSONL file path for a session ID using the mtime-cached
 * directory index.
 */
export function getSessionFile(sessionId: string): string | null {
  return getSessionFileIndex().get(sessionId) ?? null;
}

/**
 * Extract the project folder name from an absolute project path.
 */
export function extractProjectName(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

/**
 * Parse a JSONL file line-by-line into an array of typed objects.
 * Skips malformed lines. Returns an empty array if the file cannot be read.
 *
 * Uses a streaming approach to avoid loading the entire file into a single
 * JS string. Reads in 64 KB chunks so only ~64 KB is resident at any time
 * (plus the accumulated results array).
 */
export function parseJsonlFile<T>(filePath: string): T[] {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return [];
  }

  const results: T[] = [];
  const CHUNK = 64 * 1024;
  const buf = Buffer.alloc(CHUNK);
  let leftover = "";
  let bytesRead: number;

  try {
    do {
      bytesRead = fs.readSync(fd, buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      const chunk = leftover + buf.toString("utf-8", 0, bytesRead);
      const lines = chunk.split("\n");
      // Last element may be incomplete — carry it over
      leftover = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          results.push(JSON.parse(line) as T);
        } catch {
          // Skip malformed lines — expected during partial writes
        }
      }
    } while (bytesRead === CHUNK);

    // Process any remaining data
    if (leftover.trim()) {
      try {
        results.push(JSON.parse(leftover) as T);
      } catch {
        // Skip
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  return results;
}

export interface SessionMeta {
  branch: string;
  entrypoint: string;
  rename: string;
  summary: string;
  /** Latest CLI-generated topic title (`{type:"ai-title"}`). Higher quality than `summary`. */
  aiTitle: string;
}

/**
 * LRU-backed mtime cache for session metadata. parseSessions() runs
 * once per file-watcher tick (multiple per minute during active
 * sessions). Without caching, every tick re-read 256KB+64KB per session
 * even when only one transcript had changed. With it, an unchanged
 * session resolves in one stat call.
 *
 * Keyed by path, gated on (mtimeMs, size) — mtime alone is not enough on
 * second-granularity filesystems where two writes in the same second can
 * share an mtime. Capacity is bounded by META_CACHE_MAX so the cache
 * cannot grow without limit on long-lived hosts; the LRU evicts the
 * least-recently-used path when full.
 */
interface MetaCacheEntry {
  mtimeMs: number;
  size: number;
  value: SessionMeta;
}
const sessionMetaCache = new LRU<string, MetaCacheEntry>(META_CACHE_MAX);

/**
 * Read both the head (first ~256KB) and tail (last ~64KB) of a session file
 * to extract metadata:
 * - branch (latest gitBranch — reflects current branch even after switches)
 * - entrypoint (from early lines — never changes)
 * - rename (most recent /rename command)
 * - summary (most recent auto-generated summary)
 *
 * We need the tail because long-running sessions may have switched branches
 * mid-session, and the starting branch is misleading. The head captures
 * entrypoint and early summaries; the tail captures the latest branch.
 *
 * Results are mtime-cached. Same path with the same (mtime, size) returns
 * the previously parsed meta object without touching the file again.
 */
export function readSessionMeta(filePath: string): SessionMeta {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    // No stable cache key — drop any prior entry and compute uncached.
    sessionMetaCache.delete(filePath);
    return computeSessionMeta(filePath);
  }
  const cached = sessionMetaCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.value;
  }
  const value = computeSessionMeta(filePath);
  sessionMetaCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, value });
  return value;
}

/**
 * Invalidate the cached meta for a single session file. Used by the
 * targeted file-watcher path so a single transcript change does not
 * stale the rest of the cache.
 */
export function invalidateSessionMetaCache(filePath: string): void {
  sessionMetaCache.delete(filePath);
}

/**
 * Drop both module-level meta caches: the per-file metadata LRU and the
 * `sessionId -> path` directory index. Used by the global reload so a
 * full re-parse rebuilds everything from disk rather than trusting the
 * mtime gates. Targeted file-watcher refreshes still use
 * {@link invalidateSessionMetaCache} for the single changed file.
 */
export function clearMetaCaches(): void {
  sessionMetaCache.clear();
  sessionFileIndex = null;
}

/**
 * Drop only the `sessionId -> path` directory index (not the per-file meta
 * LRU). Used to recover from a stale index on coarse-granularity filesystems
 * (NFS/SMB/exFAT, some virtualized mounts) where creating a new transcript
 * does not bump the parent subdirectory's mtime, so {@link getSessionFileIndex}
 * would wrongly serve a cached index that omits the new file. Forcing a rebuild
 * runs a fresh readdirSync, which reflects the true current directory contents
 * regardless of mtime.
 */
export function invalidateSessionFileIndex(): void {
  sessionFileIndex = null;
}

function computeSessionMeta(filePath: string): SessionMeta {
  const result = { branch: "", entrypoint: "", rename: "", summary: "", aiTitle: "" };
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return result;
  }

  try {
    const stat = fs.fstatSync(fd);
    const headSize = Math.max(SESSION_META_READ_BYTES, NAME_HINT_READ_BYTES);
    const headBytes = Math.min(headSize, stat.size);

    // Read head chunk
    const headBuf = Buffer.alloc(headBytes);
    fs.readSync(fd, headBuf, 0, headBytes, 0);
    const headChunk = headBuf.toString("utf-8");
    processMetaChunk(headChunk, result, /* isTail */ false);

    // If the file is bigger than the head read, also read a tail chunk
    // to capture the latest gitBranch. Avoid overlap with the head.
    if (stat.size > headBytes) {
      const tailBytes = Math.min(TAIL_READ_BYTES, stat.size - headBytes);
      const tailBuf = Buffer.alloc(tailBytes);
      const tailOffset = stat.size - tailBytes;
      fs.readSync(fd, tailBuf, 0, tailBytes, tailOffset);
      const tailChunk = tailBuf.toString("utf-8");
      processMetaChunk(tailChunk, result, /* isTail */ true);
    }
  } catch {
    // Read error — return whatever we have
  } finally {
    fs.closeSync(fd);
  }

  return result;
}

/**
 * Parse a chunk of JSONL and merge metadata into the running result.
 * When processing the tail, branch/summary overwrite; entrypoint never does.
 */
function processMetaChunk(
  chunk: string,
  result: SessionMeta,
  isTail: boolean,
): void {
  const hasRename = chunk.includes("/rename");
  const hasSummary = chunk.includes('"type":"summary"') || chunk.includes('"type": "summary"');
  const hasAiTitle = chunk.includes('"type":"ai-title"') || chunk.includes('"type": "ai-title"');

  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line) as Record<string, unknown>;

      // Branch — take the LATEST one seen. When processing the tail, every
      // branch overwrites the previous. When processing the head, we only
      // set it if unset (let tail override).
      if (typeof entry.gitBranch === "string") {
        if (isTail || !result.branch) {
          result.branch = entry.gitBranch;
        }
      }

      // Entrypoint only exists in early lines — never overwrite
      if (typeof entry.entrypoint === "string" && !result.entrypoint) {
        result.entrypoint = entry.entrypoint;
      }

      // Auto-summary — take the latest one seen
      if (hasSummary && entry.type === "summary" && typeof entry.summary === "string") {
        result.summary = (entry.summary as string).trim();
      }

      // CLI-generated topic title (`type:"ai-title"`) — latest wins.
      // Emitted by Claude CLI 2.1+ as the terminal/session title.
      if (hasAiTitle && entry.type === "ai-title" && typeof entry.aiTitle === "string") {
        result.aiTitle = (entry.aiTitle as string).trim();
      }

      // /rename command in user message — take the latest one seen
      if (hasRename && line.includes("/rename")) {
        const msg = (entry as { message?: { content?: unknown } }).message;
        if (msg?.content) {
          const text =
            typeof msg.content === "string"
              ? msg.content
              : Array.isArray(msg.content)
                ? (msg.content as Array<{ text?: string }>).map((b) => b.text ?? "").join("")
                : "";
          const match = text.match(/<command-name>\/rename<\/command-name>[\s\S]*?<command-args>([^<]+)<\/command-args>/);
          if (match?.[1]) {
            result.rename = match[1].trim();
          }
        }
      }
    } catch {
      // Partial JSON at chunk boundary — expected (first line of tail is usually partial)
    }
  }
}
