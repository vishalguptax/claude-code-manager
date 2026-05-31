/**
 * Read the SessionStart hook's `active-sessions.json` registry, watch
 * it for changes, and link each entry to the VS Code terminal that
 * hosts it. Match key: `vscode.Terminal.processId === entry.ppid`
 * (the CLI's parent is its host shell, which is exactly what
 * `Terminal.processId` returns).
 *
 * Stale entries — older than 1h or whose ppid no longer points at a
 * live process — are skipped at read time so a crashed CLI doesn't
 * leave a permanent "View" affordance.
 */
import * as fs from "fs";
import * as vscode from "vscode";
import { SESSION_ACTIVE_FILE } from "../../core/config";
import type { TerminalRegistry } from "./terminalRegistry";

export interface ActiveEntry {
  sessionId: string;
  ppid: number;
  cwd: string;
  transcriptPath: string;
  ts: number;
}

const STALE_MS = 60 * 60 * 1000;

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse + filter the on-disk registry. Returns an empty array on any
 * read / parse failure — the file is purely advisory.
 */
export function readActiveSessions(now: number = Date.now()): ActiveEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(SESSION_ACTIVE_FILE, "utf-8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ActiveEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const e = item as Partial<ActiveEntry>;
    if (
      typeof e.sessionId !== "string" ||
      typeof e.ppid !== "number" ||
      typeof e.ts !== "number"
    ) {
      continue;
    }
    if (now - e.ts > STALE_MS) continue;
    if (!isProcessAlive(e.ppid)) continue;
    out.push({
      sessionId: e.sessionId,
      ppid: e.ppid,
      cwd: typeof e.cwd === "string" ? e.cwd : "",
      transcriptPath: typeof e.transcriptPath === "string" ? e.transcriptPath : "",
      ts: e.ts,
    });
  }
  return out;
}

/**
 * Resolve each fresh entry to a VS Code terminal by PPID match and
 * register the pair so the row + detail action swap to View. Terminals
 * that haven't reported their processId yet are skipped this tick; the
 * next file-watcher tick (or terminal create) retries.
 */
async function syncMatches(registry: TerminalRegistry): Promise<void> {
  const entries = readActiveSessions();
  if (entries.length === 0) return;
  const byPpid = new Map<number, ActiveEntry>();
  for (const e of entries) byPpid.set(e.ppid, e);

  for (const term of vscode.window.terminals) {
    let pid: number | undefined;
    try {
      pid = await term.processId;
    } catch {
      continue;
    }
    if (pid === undefined) continue;
    const match = byPpid.get(pid);
    if (match) registry.register(match.sessionId, term);
  }
}

/**
 * Wire up the watcher: an initial sync on activation, a file-watcher on
 * the registry file, and a re-sync when terminals open (a freshly-opened
 * terminal can match an entry that was just appended).
 *
 * Returns a Disposable that tears everything down.
 */
export function startActiveSessionWatcher(registry: TerminalRegistry): vscode.Disposable {
  void syncMatches(registry);

  const fileWatcher = vscode.workspace.createFileSystemWatcher(SESSION_ACTIVE_FILE);
  const onAny = (): void => {
    void syncMatches(registry);
  };
  fileWatcher.onDidCreate(onAny);
  fileWatcher.onDidChange(onAny);
  fileWatcher.onDidDelete(onAny);

  const terminalOpen = vscode.window.onDidOpenTerminal(onAny);

  return {
    dispose: () => {
      fileWatcher.dispose();
      terminalOpen.dispose();
    },
  };
}
