/**
 * Ephemeral (temp) session support.
 *
 * Temp session = a regular `claude` run whose JSONL transcript and
 * history.jsonl rows are deleted once the user closes the terminal.
 * Skills, agents, hooks, MCP servers, and settings are NOT redirected,
 * so the user gets their full Claude environment — only the persisted
 * record disappears.
 *
 * Mechanism:
 *   1. At launch, snapshot the set of existing `<sessionId>.jsonl` files
 *      in the project's slug directory and record a launch timestamp.
 *   2. On terminal close, list the slug directory again. Any `.jsonl`
 *      that was not in the snapshot AND has mtime >= the launch
 *      timestamp is treated as belonging to that terminal and deleted.
 *      Matching history.jsonl rows are stripped.
 *
 * Why snapshot + mtime rather than parsing transcript headers:
 *   - We do not know the session id at launch time (Claude CLI mints
 *     it after the first prompt).
 *   - A single terminal can spawn multiple session files via `/clear`,
 *     so we must match by directory diff rather than a single id.
 *
 * Persistence: pending temp sessions are written to globalState so a
 * VS Code reload or crash mid-session does not orphan transcripts.
 * `sweepOrphans()` runs at activate.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { HISTORY_FILE, PROJECTS_DIR } from "../core/config";
import { slugifyProjectPath } from "../features/sessions/portable";

/** Shape persisted in globalState. */
interface PendingTempSession {
  slug: string;
  startedAt: number;
  snapshotIds: string[];
  /**
   * Session IDs the user chose to keep ("Make permanent"). Excluded from both
   * the temp-id set shown in the UI and the close-time cleanup, so a promoted
   * session survives as a regular session.
   */
  promotedIds?: string[];
}

const STORAGE_KEY = "claudeManager.pendingTempSessions";

let _storage: vscode.Memento | undefined;

/** Wire globalState in at activate time. */
export function setEphemeralStorage(storage: vscode.Memento): void {
  _storage = storage;
}

function readPending(): PendingTempSession[] {
  return _storage?.get<PendingTempSession[]>(STORAGE_KEY, []) ?? [];
}

function writePending(list: PendingTempSession[]): void {
  void _storage?.update(STORAGE_KEY, list);
}

/**
 * Snapshot existing session IDs for a project slug.
 * Returns an empty array if the slug dir doesn't exist yet (first session
 * in a fresh project — every later file is ephemeral and will be cleaned).
 */
function snapshotSlug(slug: string): string[] {
  const dir = path.join(PROJECTS_DIR, slug);
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.slice(0, -".jsonl".length));
  } catch {
    return [];
  }
}

/**
 * Diff slug dir against snapshot + start time, return session IDs that
 * appeared during the temp run. Files older than `startedAt` are ignored
 * even if missing from the snapshot, so a concurrent non-temp session
 * that began before our launch is never touched.
 */
export function findEphemeralSessions(
  slug: string,
  snapshotIds: string[],
  startedAt: number,
): string[] {
  const dir = path.join(PROJECTS_DIR, slug);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const snap = new Set(snapshotIds);
  const found: string[] = [];
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const id = name.slice(0, -".jsonl".length);
    if (snap.has(id)) continue;
    const full = path.join(dir, name);
    let mtime: number;
    try {
      mtime = fs.statSync(full).mtimeMs;
    } catch {
      continue;
    }
    // 1s slack: filesystems with second-granularity mtimes can report
    // a timestamp slightly before the launch wall-clock.
    if (mtime + 1000 < startedAt) continue;
    found.push(id);
  }
  return found;
}

/**
 * Strip every history.jsonl line whose `sessionId` is in `ids`.
 * Done as a single read + filter + atomic rename so a partial write
 * cannot leave history.jsonl truncated. If history.jsonl doesn't
 * exist (the user has never run Claude before, or just deleted it),
 * silently skip.
 */
export function stripHistoryLines(ids: string[]): void {
  if (ids.length === 0) return;
  let raw: string;
  try {
    raw = fs.readFileSync(HISTORY_FILE, "utf-8");
  } catch {
    return;
  }
  const target = new Set(ids);
  const kept: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as { sessionId?: string };
      if (obj.sessionId && target.has(obj.sessionId)) continue;
    } catch {
      // Malformed line — keep it. We are not in the business of
      // silently editing user data we don't understand.
    }
    kept.push(line);
  }
  const tmp = HISTORY_FILE + ".csm-tmp";
  fs.writeFileSync(tmp, kept.length > 0 ? kept.join("\n") + "\n" : "");
  fs.renameSync(tmp, HISTORY_FILE);
}

/**
 * The set of session IDs currently considered temp: for every pending entry,
 * the IDs its close-time cleanup WOULD delete (same snapshot+mtime diff),
 * minus any the user promoted to permanent. This is what the webview marks
 * with a "Temp" badge — no separate id bookkeeping needed, the cleanup logic
 * IS the source of truth.
 */
export function getTempSessionIds(): string[] {
  const out = new Set<string>();
  for (const entry of readPending()) {
    const promoted = new Set(entry.promotedIds ?? []);
    for (const id of findEphemeralSessions(entry.slug, entry.snapshotIds, entry.startedAt)) {
      if (!promoted.has(id)) out.add(id);
    }
  }
  return [...out];
}

/**
 * Promote a temp session to a regular one: mark its ID promoted on every
 * pending entry that would otherwise clean it, so it is excluded from both the
 * temp-id set and close-time deletion. Returns true if anything changed (the
 * caller then re-pushes the session list). No-op for an unknown / already-
 * promoted id.
 */
export function promoteTempSession(sessionId: string): boolean {
  const pending = readPending();
  let changed = false;
  for (const entry of pending) {
    const ids = findEphemeralSessions(entry.slug, entry.snapshotIds, entry.startedAt);
    if (!ids.includes(sessionId)) continue;
    const promoted = (entry.promotedIds ??= []);
    if (!promoted.includes(sessionId)) {
      promoted.push(sessionId);
      changed = true;
    }
  }
  if (changed) writePending(pending);
  return changed;
}

/**
 * Delete every JSONL the temp run produced and prune history.jsonl.
 * Promoted (kept) sessions are excluded. Pure I/O — callable from the close
 * handler and from sweep alike.
 */
export function cleanupEphemeral(entry: PendingTempSession): void {
  const promoted = new Set(entry.promotedIds ?? []);
  const ids = findEphemeralSessions(entry.slug, entry.snapshotIds, entry.startedAt).filter(
    (id) => !promoted.has(id),
  );
  for (const id of ids) {
    const file = path.join(PROJECTS_DIR, entry.slug, `${id}.jsonl`);
    try {
      fs.unlinkSync(file);
    } catch {
      // Already gone — fine. Race with manual deletion or another sweep.
    }
  }
  stripHistoryLines(ids);
}

/**
 * Register a freshly-created terminal as ephemeral. Snapshots existing
 * session IDs, persists the pending entry, and hooks the terminal's
 * close event so cleanup fires when the user exits Claude.
 */
export function registerEphemeralTerminal(
  term: vscode.Terminal,
  projectPath: string,
  onCleaned?: () => void,
): vscode.Disposable {
  const slug = slugifyProjectPath(projectPath);
  const entry: PendingTempSession = {
    slug,
    startedAt: Date.now(),
    snapshotIds: snapshotSlug(slug),
  };
  const pending = readPending();
  pending.push(entry);
  writePending(pending);

  const disp = vscode.window.onDidCloseTerminal((closed) => {
    if (closed !== term) return;
    try {
      // Re-read the current entry so any "Make permanent" promotions recorded
      // after registration are honored (the captured `entry` is stale).
      const current =
        readPending().find(
          (p) => p.slug === entry.slug && p.startedAt === entry.startedAt,
        ) ?? entry;
      cleanupEphemeral(current);
    } finally {
      const remaining = readPending().filter(
        (p) => !(p.slug === entry.slug && p.startedAt === entry.startedAt),
      );
      writePending(remaining);
      disp.dispose();
      // Cleanup mutates files but VS Code's FileSystemWatcher does not reliably
      // deliver events for our own unlink + atomic history-rename, so the row
      // would linger (and Resume would hit a deleted transcript). Tell the view
      // to reparse + re-push explicitly.
      onCleaned?.();
    }
  });
  return disp;
}

/**
 * Run on activate. Cleans up any temp session whose terminal close we
 * never observed (window reload, crash, force-quit). Safe to call
 * repeatedly: if nothing is pending, this is a no-op.
 */
export function sweepOrphans(): void {
  const pending = readPending();
  if (pending.length === 0) return;
  for (const entry of pending) {
    try {
      cleanupEphemeral(entry);
    } catch {
      // Best effort — a bad entry must not block the rest.
    }
  }
  writePending([]);
}
