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
 *   1. At launch, mint a session id and start `claude --session-id <id>`,
 *      recording that exact id in a pending entry.
 *   2. On terminal close, delete `<id>.jsonl` and strip its history.jsonl
 *      rows — nothing else.
 *
 * Why an exact id rather than diffing the project directory: a directory
 * diff ("every new .jsonl since launch") also matches ordinary sessions the
 * user starts in another terminal or window of the same project while the
 * temp run is open, and deleted them. The cost of exactness: a fresh
 * session started inside the temp terminal via `/clear` gets a new id we
 * never learn, so it survives as a regular session. Keeping too much is
 * recoverable; deleting the wrong transcript is not.
 *
 * Persistence: pending entries live in globalState so a reload or crash
 * mid-session does not orphan transcripts. globalState is shared by every
 * VS Code window, so each entry records the extension host that owns it and
 * `sweepOrphans()` (run at activate) only reclaims entries whose owner is
 * gone — never a temp session still running in another window.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { HISTORY_FILE, PROJECTS_DIR } from "../../core/config";
import { writeFileAtomic } from "../../core/atomicWrite";
import { slugifyProjectPath } from "./portable";
import { readLiveSessions } from "./liveSessions";

/** Shape persisted in globalState. */
interface PendingTempSession {
  slug: string;
  startedAt: number;
  /** Exact session ids this temp run owns and will delete. */
  sessionIds: string[];
  /**
   * PID of the extension host whose close handler will clean this entry.
   * Absent when no live host is responsible any more (its close-time cleanup
   * was deferred), which makes the entry fair game for any window's sweep.
   */
  ownerPid?: number;
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

/**
 * Entries written before ids were recorded carry only a directory snapshot
 * (`snapshotIds`) and no `sessionIds`. They normalize to an empty id list, so
 * a sweep drops them without deleting anything — re-deriving their targets
 * would mean the directory diff this module no longer trusts.
 */
function readPending(): PendingTempSession[] {
  const raw = _storage?.get<Partial<PendingTempSession>[]>(STORAGE_KEY, []) ?? [];
  return raw.map((p) => ({
    slug: p.slug ?? "",
    startedAt: p.startedAt ?? 0,
    sessionIds: Array.isArray(p.sessionIds) ? p.sessionIds : [],
    ownerPid: p.ownerPid,
    promotedIds: p.promotedIds,
  }));
}

function writePending(list: PendingTempSession[]): void {
  void _storage?.update(STORAGE_KEY, list);
}

/**
 * Probe whether a process id is still running. EPERM means the process
 * exists but belongs to another user — still alive. A recycled PID reads as
 * alive too; that only delays a sweep, it never deletes a live session.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
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
  writeFileAtomic(HISTORY_FILE, kept.length > 0 ? kept.join("\n") + "\n" : "");
}

/** Ids of an entry that cleanup would delete: owned and not promoted. */
function disposableIds(entry: PendingTempSession): string[] {
  const promoted = new Set(entry.promotedIds ?? []);
  return entry.sessionIds.filter((id) => !promoted.has(id));
}

/**
 * The set of session IDs currently considered temp, minus any the user
 * promoted to permanent. This is what the webview marks with a "Temp" badge.
 */
export function getTempSessionIds(): string[] {
  const out = new Set<string>();
  for (const entry of readPending()) {
    for (const id of disposableIds(entry)) out.add(id);
  }
  return [...out];
}

/**
 * Promote a temp session to a regular one: mark its ID promoted on every
 * pending entry that owns it, so it is excluded from both the temp-id set and
 * close-time deletion. Returns true if anything changed (the caller then
 * re-pushes the session list). No-op for an unknown / already-promoted id.
 */
export function promoteTempSession(sessionId: string): boolean {
  const pending = readPending();
  let changed = false;
  for (const entry of pending) {
    if (!entry.sessionIds.includes(sessionId)) continue;
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
 * Delete the transcripts the temp run owns and prune history.jsonl.
 * Promoted (kept) sessions are excluded. A session the CLI still reports as
 * running is skipped and returned — a reload can leave the temp `claude`
 * alive in a restored terminal, and deleting its transcript mid-run loses
 * the conversation. The caller keeps those ids pending for a later sweep.
 */
export function cleanupEphemeral(entry: PendingTempSession): string[] {
  const ids = disposableIds(entry);
  if (ids.length === 0) return [];
  const live = readLiveSessions();
  const deferred = ids.filter((id) => live.has(id));
  const doomed = ids.filter((id) => !live.has(id));
  for (const id of doomed) {
    const file = path.join(PROJECTS_DIR, entry.slug, `${id}.jsonl`);
    try {
      fs.unlinkSync(file);
    } catch {
      // Already gone — fine. Race with manual deletion or another sweep.
    }
  }
  stripHistoryLines(doomed);
  return deferred;
}

/** Identity of a pending entry: one per temp launch. */
function sameEntry(a: PendingTempSession, b: PendingTempSession): boolean {
  return a.slug === b.slug && a.startedAt === b.startedAt;
}

/**
 * Register a freshly-created terminal as ephemeral. Mints the session id the
 * caller must launch `claude --session-id <id>` with, persists the pending
 * entry, and hooks the terminal's close event so cleanup fires when the user
 * exits Claude. Returns the id and the close-handler disposable.
 */
export function registerEphemeralTerminal(
  term: vscode.Terminal,
  projectPath: string,
  onCleaned?: () => void,
): { sessionId: string; disposable: vscode.Disposable } {
  const sessionId = randomUUID();
  const entry: PendingTempSession = {
    slug: slugifyProjectPath(projectPath),
    startedAt: Date.now(),
    sessionIds: [sessionId],
    ownerPid: process.pid,
  };
  const pending = readPending();
  pending.push(entry);
  writePending(pending);

  const disposable = vscode.window.onDidCloseTerminal((closed) => {
    if (closed !== term) return;
    let deferred: string[] = [];
    try {
      // Re-read the current entry so any "Make permanent" promotions recorded
      // after registration are honored (the captured `entry` is stale).
      const current = readPending().find((p) => sameEntry(p, entry)) ?? entry;
      deferred = cleanupEphemeral(current);
    } finally {
      const remaining = readPending().flatMap((p) => {
        if (!sameEntry(p, entry)) return [p];
        // The CLI outlived its terminal for a moment: hand the leftovers to
        // whichever window sweeps next by dropping ownership.
        return deferred.length > 0 ? [{ ...p, sessionIds: deferred, ownerPid: undefined }] : [];
      });
      writePending(remaining);
      disposable.dispose();
      // Cleanup mutates files but VS Code's FileSystemWatcher does not reliably
      // deliver events for our own unlink + atomic history-rename, so the row
      // would linger (and Resume would hit a deleted transcript). Tell the view
      // to reparse + re-push explicitly.
      onCleaned?.();
    }
  });
  return { sessionId, disposable };
}

/**
 * Run on activate. Cleans up temp sessions whose terminal close no live
 * extension host will observe (window reload, crash, force-quit). Entries
 * owned by a running host — another open window, or this one — are left
 * alone: that host's close handler cleans them. Safe to call repeatedly.
 */
export function sweepOrphans(): void {
  const pending = readPending();
  if (pending.length === 0) return;
  const kept: PendingTempSession[] = [];
  for (const entry of pending) {
    if (entry.ownerPid !== undefined && isPidAlive(entry.ownerPid)) {
      kept.push(entry);
      continue;
    }
    try {
      const deferred = cleanupEphemeral(entry);
      if (deferred.length > 0) {
        kept.push({ ...entry, sessionIds: deferred, ownerPid: undefined });
      }
    } catch {
      // Best effort — a bad entry must not block the rest.
    }
  }
  writePending(kept);
}
