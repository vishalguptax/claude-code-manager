#!/usr/bin/env node
/**
 * SessionStart hook executed by Claude CLI on every session boot. Reads
 * the hook payload from stdin (`{ session_id, transcript_path, cwd, … }`),
 * captures the parent shell PID, and appends one entry to the active-
 * sessions registry the extension watches.
 *
 * The extension matches `vscode.Terminal.processId === ppid` to swap the
 * row + detail action from Resume to View for the session running in
 * that terminal. Stale entries are pruned by the host (no need for the
 * hook to clean up — CLI process exit doesn't get a SessionEnd we can
 * trust on every crash path).
 *
 * Exits 0 with no stdout/stderr — Claude CLI continues unaffected.
 * Failure modes (locked file, no perms, malformed payload) swallow
 * silently: the hook MUST NOT block or noisily fail, or it would break
 * every CLI boot.
 */
import * as fs from "fs";
import { CLAUDE_MANAGER_DIR, SESSION_ACTIVE_FILE } from "../../core/config";

interface ActiveEntry {
  sessionId: string;
  ppid: number;
  cwd: string;
  transcriptPath: string;
  ts: number;
}

interface HookPayload {
  session_id?: unknown;
  transcript_path?: unknown;
  cwd?: unknown;
}

/** Read JSON payload from stdin. Returns null on parse failure. */
function readStdin(): Promise<HookPayload | null> {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => {
      if (!raw.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    process.stdin.on("error", () => resolve(null));
  });
}

/** Coerce unknown into a non-empty string, or empty when absent. */
function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Read the registry, drop any entry older than 24h or whose ppid no
 * longer maps to a live process, then append the new entry. The 24h
 * cutoff is a backstop — the extension prunes more aggressively at
 * read time.
 */
function readRegistry(file: string): ActiveEntry[] {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return parsed.filter((e): e is ActiveEntry => {
      if (!e || typeof e !== "object") return false;
      const id = (e as ActiveEntry).sessionId;
      const ppid = (e as ActiveEntry).ppid;
      const ts = (e as ActiveEntry).ts;
      if (typeof id !== "string" || typeof ppid !== "number" || typeof ts !== "number") {
        return false;
      }
      if (now - ts > dayMs) return false;
      try {
        process.kill(ppid, 0);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const payload = await readStdin();
  if (!payload) return;

  const sessionId = s(payload.session_id);
  if (!sessionId) return;

  const dir = CLAUDE_MANAGER_DIR;
  const file = SESSION_ACTIVE_FILE;

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return;
  }

  const entries = readRegistry(file);
  const withoutSession = entries.filter((e) => e.sessionId !== sessionId);
  const entry: ActiveEntry = {
    sessionId,
    ppid: process.ppid,
    cwd: s(payload.cwd) || process.cwd(),
    transcriptPath: s(payload.transcript_path),
    ts: Date.now(),
  };
  withoutSession.push(entry);

  try {
    fs.writeFileSync(file, JSON.stringify(withoutSession), "utf-8");
  } catch {
    /* swallow — never block CLI boot */
  }
}

void main();
