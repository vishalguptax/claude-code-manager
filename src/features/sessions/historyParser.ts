/**
 * Session list reconstruction from Claude CLI data files.
 *
 * `parseSessions` merges ~/.claude/history.jsonl with orphan transcripts
 * (extension-originated sessions that never touch history) and live PID
 * state into a sorted session list. `reparseOneSession` is the targeted
 * single-session refresh used by the file watcher.
 *
 * Live-state probes live in `liveSessions.ts`; detail paging in
 * `detailParser.ts`; bounded metadata reads in `metaParser.ts`. This file
 * owns the merge + orphan-discovery logic only.
 *
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import { HISTORY_FILE, PROJECTS_DIR } from "../../core/config";
import { LRU } from "../../core/lru";
import { deslugifyProjectPath } from "./portable";
import {
  extractProjectName,
  getSessionFile,
  invalidateSessionFileIndex,
  invalidateSessionMetaCache,
  parseJsonlFile,
  readSessionMeta,
} from "./metaParser";
import {
  readSessionsDir,
  refineStatus,
  invalidatePendingCacheEntry,
  type LiveSessionInfo,
} from "./liveSessions";
import type { HistoryEntry, Session, SessionEntry } from "./types";

/**
 * Upper bound on the orphan-reconstruction cache so it cannot grow
 * without limit across thousands of distinct transcripts.
 */
const ORPHAN_CACHE_MAX = 2000;

/**
 * Warning from the most recent parseSessions() call, or null if all entries
 * looked healthy. Used by the extension host to surface schema-drift errors
 * to the user instead of silently dropping every session.
 */
let lastParseWarning: string | null = null;

/** Threshold: only warn if at least this many entries were parsed. */
const SCHEMA_DRIFT_MIN_ENTRIES = 5;
/** Threshold: warn if fewer than this fraction of entries have required fields. */
const SCHEMA_DRIFT_MIN_VALID_RATIO = 0.2;

/**
 * Return the warning produced by the most recent parseSessions() call.
 * Null if the last parse looked healthy. Use this to surface a one-time error
 * banner when the Claude CLI changes its history schema.
 */
export function getLastParseWarning(): string | null {
  return lastParseWarning;
}

/**
 * Parse all Claude Code sessions from the global history file.
 * Returns sessions sorted by most recent activity first.
 *
 * @param userRenames - Extension-managed session rename map (takes highest priority).
 */
export function parseSessions(userRenames: Record<string, string> = {}): Session[] {
  const { names: sessionNames, live: liveMap } = readSessionsDir();
  const entries = parseJsonlFile<HistoryEntry>(HISTORY_FILE);

  // Group entries by sessionId
  const sessionMap = new Map<
    string,
    { entries: HistoryEntry[]; project: string; projectPath: string }
  >();

  // Track invalid count so we can detect schema drift. Without this, a CLI
  // upgrade that renames `sessionId` or `display` would silently drop every
  // session and the user would just see "No sessions yet" with no explanation.
  let invalidCount = 0;
  for (const entry of entries) {
    if (!entry.sessionId || !entry.display) {
      invalidCount++;
      continue;
    }

    const existing = sessionMap.get(entry.sessionId);
    if (existing) {
      existing.entries.push(entry);
    } else {
      sessionMap.set(entry.sessionId, {
        entries: [entry],
        project: extractProjectName(entry.project || ""),
        projectPath: entry.project || "",
      });
    }
  }

  if (
    entries.length >= SCHEMA_DRIFT_MIN_ENTRIES &&
    (entries.length - invalidCount) / entries.length < SCHEMA_DRIFT_MIN_VALID_RATIO
  ) {
    lastParseWarning =
      `Claude history schema may have changed: ${invalidCount} of ${entries.length} entries are missing required fields. ` +
      `If you recently updated the Claude CLI, the extension may need an update.`;
  } else {
    lastParseWarning = null;
  }

  // Build session objects.
  //
  // `projectPathByKey` remembers the first-seen absolute path for each
  // lowercased project name so Windows casing variants collapse into a
  // single dropdown entry. History-derived sessions populate it here;
  // orphan discovery (below) both reads from and extends it.
  const sessions: Session[] = [];
  const projectPathByKey = new Map<string, string>();
  for (const [sessionId, data] of sessionMap) {
    const timestamps = data.entries.map((e) => e.timestamp);
    const prompts = data.entries
      .map((e) => e.display)
      .filter((d): d is string => Boolean(d) && d !== "/login ");
    if (prompts.length === 0) continue;

    // Read branch + entrypoint + name hints in one bounded file read
    let branch = "";
    let entrypoint = "";
    const sessionFile = getSessionFile(sessionId);
    let fileRename = "";
    let fileSummary = "";
    let fileAiTitle = "";
    if (sessionFile) {
      const meta = readSessionMeta(sessionFile);
      branch = meta.branch;
      entrypoint = meta.entrypoint;
      fileRename = meta.rename;
      fileSummary = meta.summary;
      fileAiTitle = meta.aiTitle;
    }

    const summary =
      prompts[0].length > 100 ? prompts[0].slice(0, 100) + "..." : prompts[0];

    // Resolve session name with priority:
    // 1. Extension-managed rename (always wins)
    // 2. /rename command in transcript
    // 3. CLI-generated `ai-title` (Claude 2.1+ terminal/session title)
    // 4. Claude's older auto-generated meta `summary`
    // 5. First-prompt summary — descriptive text a brand-new session has before
    //    the CLI generates an ai-title, so it beats the generic PID slug.
    // 6. Live PID-file `name` (CLI auto-slug like `project-4b`) — last resort.
    let name = userRenames[sessionId] ?? "";
    if (!name)
      name = fileRename || fileAiTitle || fileSummary || summary || sessionNames.get(sessionId) || "";

    // Pre-compute lowercased lookup keys so the webview filter does not
    // allocate strings on every keystroke. searchHaystack joins fields with
    // "\n" so that user input cannot accidentally match across boundaries.
    const projectKey = data.project.toLowerCase();
    const searchHaystack = `${name}\n${data.project}\n${branch}\n${summary}`.toLowerCase();

    // Canonicalize projectPath casing: same project typed with
    // different casings collapses into one entry. First sighting wins.
    const canonicalPath =
      projectPathByKey.get(projectKey) ?? data.projectPath;
    if (!projectPathByKey.has(projectKey)) {
      projectPathByKey.set(projectKey, data.projectPath);
    }

    sessions.push({
      id: sessionId,
      name,
      project: data.project,
      projectPath: canonicalPath,
      branch,
      entrypoint,
      startTime: Math.min(...timestamps),
      endTime: Math.max(...timestamps),
      messageCount: prompts.length,
      summary,
      prompts,
      projectKey,
      searchHaystack,
      isLive: liveMap.has(sessionId),
      status: liveMap.has(sessionId)
        ? refineStatus(sessionId, liveMap.get(sessionId)?.status)
        : undefined,
      liveUpdatedAt: liveMap.get(sessionId)?.updatedAt,
    });
  }

  // Sessions started inside the official Claude Code VS Code extension
  // do NOT add entries to ~/.claude/history.jsonl — the CLI owns that
  // file, not the extension. Without this pass, every extension-
  // originated session would be invisible in Claude Manager even
  // though the transcript sits on disk under projects/.
  //
  // We scan the projects directory for any sessionId that did not come
  // through history.jsonl and reconstruct a Session object by reading
  // the transcript header for the first user prompt, cwd, and
  // timestamp span.
  const knownIds = new Set(sessionMap.keys());
  const orphans = discoverOrphanSessions(
    knownIds,
    userRenames,
    sessionNames,
    projectPathByKey,
    liveMap,
  );
  sessions.push(...orphans);

  sessions.sort((a, b) => b.endTime - a.endTime);
  return sessions;
}

/**
 * Shape returned by `readOrphanSessionData` — null when the file has no
 * usable content.
 *
 * `branch`, `entrypoint`, `rename`, `summary` are captured during the
 * single streaming pass so `discoverOrphanSessions` doesn't have to
 * call `readSessionMeta` afterwards (which would trigger a second
 * 320KB read on top of the full-file stream we already did). Latest-
 * wins for branch + summary mirrors the head/tail rules in
 * `processMetaChunk`. Entrypoint = first observed.
 */
interface OrphanData {
  cwd: string;
  firstPrompt: string;
  messageCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  branch: string;
  entrypoint: string;
  rename: string;
  summary: string;
  aiTitle: string;
}

/**
 * LRU cache of `readOrphanSessionData` results keyed on file path, valid
 * while the underlying file's mtime hasn't changed. Transcript files
 * can be 50 MB+ each and parseSessions reruns on every file-watcher
 * tick — without this cache, a watcher-triggered refresh on one
 * session would re-stream every other orphan file in the projects
 * directory. With it, a refresh costs one stat per unchanged orphan.
 *
 * Negative cache entries (data === null) are kept too so empty /
 * queue-only shells don't get re-read each tick. Capped so it cannot
 * grow without bound.
 */
const orphanCache = new LRU<string, { mtimeMs: number; data: OrphanData | null }>(ORPHAN_CACHE_MAX);

/** Drop the orphan-cache entry for a single transcript so the next read re-streams it. */
function invalidateOrphanCacheEntry(filePath: string): void {
  orphanCache.delete(filePath);
}

/** Drop every orphan-cache entry. Used by the global reload to force a cold re-stream. */
export function clearOrphanCache(): void {
  orphanCache.clear();
}

/**
 * Extract the bits of metadata we need to synthesize a Session object
 * from a transcript .jsonl that has no history.jsonl entries.
 *
 * Streams the file in bounded chunks, stopping early once we have a
 * first user prompt + cwd. We still need to reach the tail to get the
 * last timestamp — but we only keep the *latest* timestamp seen rather
 * than collecting every entry, so memory stays flat regardless of
 * transcript length.
 */
function readOrphanSessionData(filePath: string): OrphanData | null {
  // Mtime cache: avoid re-streaming unchanged transcripts on every
  // parseSessions. A missing stat bails to the uncached read path.
  try {
    const st = fs.statSync(filePath);
    const cached = orphanCache.get(filePath);
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.data;
    const fresh = readOrphanSessionDataUncached(filePath);
    orphanCache.set(filePath, { mtimeMs: st.mtimeMs, data: fresh });
    return fresh;
  } catch {
    return readOrphanSessionDataUncached(filePath);
  }
}

function readOrphanSessionDataUncached(filePath: string): OrphanData | null {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return null;
  }

  let cwd = "";
  let firstPrompt = "";
  let messageCount = 0;
  let firstTimestamp = 0;
  let lastTimestamp = 0;
  let branch = "";
  let entrypoint = "";
  let rename = "";
  let summary = "";
  let aiTitle = "";
  const CHUNK = 64 * 1024;
  const buf = Buffer.alloc(CHUNK);
  let leftover = "";
  let bytesRead: number;

  const captureRename = (line: string, message: { content?: unknown } | undefined): void => {
    if (!line.includes("/rename")) return;
    if (!message?.content) return;
    const text =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? (message.content as Array<{ text?: string }>)
              .map((b) => b.text ?? "")
              .join("")
          : "";
    const match = text.match(
      /<command-name>\/rename<\/command-name>[\s\S]*?<command-args>([^<]+)<\/command-args>/,
    );
    if (match?.[1]) rename = match[1].trim();
  };

  try {
    do {
      bytesRead = fs.readSync(fd, buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      const chunk = leftover + buf.toString("utf-8", 0, bytesRead);
      const lines = chunk.split("\n");
      leftover = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let entry: SessionEntry;
        try {
          entry = JSON.parse(line) as SessionEntry;
        } catch {
          continue;
        }
        if (!cwd && typeof entry.cwd === "string") cwd = entry.cwd;
        if (typeof entry.timestamp === "string") {
          const ts = Date.parse(entry.timestamp);
          if (!Number.isNaN(ts)) {
            if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
            if (ts > lastTimestamp) lastTimestamp = ts;
          }
        }
        // Meta capture mirrors readSessionMeta: branch + summary follow
        // latest-wins, entrypoint takes the first observed value.
        const e = entry as unknown as Record<string, unknown>;
        if (typeof e.gitBranch === "string") branch = e.gitBranch;
        if (typeof e.entrypoint === "string" && !entrypoint) entrypoint = e.entrypoint;
        if (e.type === "summary" && typeof e.summary === "string") {
          summary = (e.summary as string).trim();
        }
        if (e.type === "ai-title" && typeof e.aiTitle === "string") {
          aiTitle = (e.aiTitle as string).trim();
        }
        captureRename(line, entry.message);
        if (entry.message?.role === "user" && !entry.isSidechain) {
          messageCount++;
          if (!firstPrompt) {
            const content = entry.message.content;
            if (typeof content === "string") {
              firstPrompt = content;
            } else if (Array.isArray(content)) {
              const text = content
                .map((b) => (typeof b.text === "string" ? b.text : ""))
                .filter(Boolean)
                .join(" ");
              if (text) firstPrompt = text;
            }
          }
        }
      }
    } while (bytesRead === CHUNK);

    if (leftover.trim()) {
      try {
        const entry = JSON.parse(leftover) as SessionEntry;
        if (typeof entry.timestamp === "string") {
          const ts = Date.parse(entry.timestamp);
          if (!Number.isNaN(ts) && ts > lastTimestamp) lastTimestamp = ts;
        }
      } catch {
        // ignore — partial JSON at EOF is normal
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  // A file with no user messages isn't a real session — skip it so
  // empty shells (queue-operation-only files) don't clutter the list.
  if (!firstPrompt || messageCount === 0) return null;

  return {
    cwd,
    firstPrompt,
    messageCount,
    firstTimestamp,
    lastTimestamp,
    branch,
    entrypoint,
    rename,
    summary,
    aiTitle,
  };
}

/**
 * Walk ~/.claude/projects/ and build Session objects for any transcript
 * file whose sessionId isn't already in the history-derived map. Skips
 * directories we can't read (permissions, dangling symlinks) instead
 * of failing the whole parse.
 *
 * Takes `projectPathByKey` so it can align path casing with whatever
 * history.jsonl already used. Without this, Windows users who see both
 * `C--Users-foo` and `c--Users-foo` slugs for the same project would
 * get duplicated entries in the project dropdown — one per casing.
 */
function discoverOrphanSessions(
  knownIds: Set<string>,
  userRenames: Record<string, string>,
  sessionNames: Map<string, string>,
  projectPathByKey: Map<string, string>,
  liveMap: Map<string, LiveSessionInfo>,
): Session[] {
  const out: Session[] = [];
  let projectSlugs: string[];
  try {
    projectSlugs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return out;
  }

  for (const slug of projectSlugs) {
    const dirPath = path.join(PROJECTS_DIR, slug);
    let files: string[];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const sessionId = file.slice(0, -".jsonl".length);
      if (knownIds.has(sessionId)) continue;

      const filePath = path.join(dirPath, file);
      const data = readOrphanSessionData(filePath);
      if (!data) continue;

      // Meta is captured during the streaming pass above so we don't
      // re-read 320KB per orphan via readSessionMeta.
      // Resolve projectPath with a three-tier fallback:
      //   1. cwd recorded in the JSONL — exact + authoritative
      //   2. slug-decoded (best-effort; lossy around embedded dashes)
      //   3. raw slug (so the UI shows *something* instead of blank)
      // Without this fallback, orphan sessions that never recorded a
      // cwd would have empty projectPath and Resume couldn't launch.
      const rawProjectPath = data.cwd || deslugifyProjectPath(slug) || slug;
      const project = extractProjectName(rawProjectPath);
      const projectKey = project.toLowerCase();

      // Windows path-casing dedupe: if history already saw this
      // project under a different casing (e.g. `C:\Users\foo` vs
      // `c:\Users\foo`), reuse the established path so both casings
      // collapse into one dropdown entry. Only applies when the
      // project name lowercases identically — real distinct projects
      // with different names aren't touched.
      const canonicalPath = projectPathByKey.get(projectKey) ?? rawProjectPath;
      if (!projectPathByKey.has(projectKey)) {
        projectPathByKey.set(projectKey, rawProjectPath);
      }

      const summary =
        data.firstPrompt.length > 100
          ? data.firstPrompt.slice(0, 100) + "..."
          : data.firstPrompt;

      // Name resolution mirrors the history path: extension rename >
      // /rename in transcript > ai-title (CLI 2.1+) > meta summary >
      // first-prompt summary > active-session PID-file slug (last resort).
      let name = userRenames[sessionId] ?? "";
      if (!name)
        name = data.rename || data.aiTitle || data.summary || summary || sessionNames.get(sessionId) || "";

      const searchHaystack =
        `${name}\n${project}\n${data.branch}\n${summary}`.toLowerCase();

      out.push({
        id: sessionId,
        name,
        project,
        projectPath: canonicalPath,
        branch: data.branch,
        entrypoint: data.entrypoint,
        startTime: data.firstTimestamp || data.lastTimestamp,
        endTime: data.lastTimestamp || data.firstTimestamp,
        messageCount: data.messageCount,
        summary,
        prompts: [data.firstPrompt],
        projectKey,
        searchHaystack,
        isLive: liveMap.has(sessionId),
        status: liveMap.has(sessionId)
          ? refineStatus(sessionId, liveMap.get(sessionId)?.status)
          : undefined,
        liveUpdatedAt: liveMap.get(sessionId)?.updatedAt,
      });
    }
  }

  return out;
}

/**
 * Re-parse a single session by id, returning a fresh Session object or
 * null when the session no longer exists.
 *
 * Used by the targeted file-watcher path so a single transcript change
 * doesn't trigger a full corpus re-read. Only the named session's
 * mtime cache entry is invalidated; siblings keep their cached meta.
 *
 * For history-derived sessions we re-read history.jsonl to rebuild the
 * prompt list (a transcript append corresponds to a new history entry
 * for active sessions). Orphan sessions don't have history entries and
 * are reconstructed entirely from the transcript stream.
 */
export function reparseOneSession(
  sessionId: string,
  userRenames: Record<string, string> = {},
): Session | null {
  return reparseSessionsBatch([sessionId], userRenames).get(sessionId) ?? null;
}

/**
 * Batch variant for the watcher's debounce tick: several transcripts
 * changed together (parallel sessions all generating). Invalidates every
 * changed file's caches FIRST, then runs the corpus rebuild ONCE and
 * plucks each id — the per-id version cost one O(sessions) directory
 * walk per changed transcript where a single walk suffices.
 *
 * parseSessions is mtime-cached for meta reads and the file index, so
 * the single rebuild is dominated by history.jsonl (small,
 * line-streamed) plus one transcript meta read per invalidated session;
 * sibling meta reads are served from cache. Ids with no known file map
 * to null (session deleted).
 */
export function reparseSessionsBatch(
  sessionIds: string[],
  userRenames: Record<string, string> = {},
): Map<string, Session | null> {
  const result = new Map<string, Session | null>();
  let anyKnown = false;
  let forcedIndexRebuild = false;
  for (const id of sessionIds) {
    result.set(id, null);
    let filePath = getSessionFile(id);
    if (!filePath && !forcedIndexRebuild) {
      // A miss can mean the session was deleted, OR the directory index is
      // stale — on coarse-mtime filesystems a brand-new transcript may not
      // bump the parent subdir mtime, so the cached index omits it and this
      // new session would be silently dropped. Force one rebuild (fresh
      // readdir) and retry before trusting the miss.
      invalidateSessionFileIndex();
      forcedIndexRebuild = true;
      filePath = getSessionFile(id);
    }
    if (!filePath) continue;
    anyKnown = true;
    // Drop the stale cache entries so the next readSessionMeta picks up
    // the new mtime. Without this the cached meta from before the
    // change wins.
    invalidateSessionMetaCache(filePath);
    invalidateOrphanCacheEntry(filePath);
    invalidatePendingCacheEntry(filePath);
  }
  if (!anyKnown) return result;

  const sessions = parseSessions(userRenames);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  for (const id of sessionIds) {
    if (byId.has(id)) result.set(id, byId.get(id)!);
  }
  return result;
}
