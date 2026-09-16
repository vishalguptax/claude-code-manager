/**
 * Prompt History reader — `~/.claude/history.jsonl`.
 *
 * The file is the CLI's append-only log of every prompt the user has typed,
 * in every project, since they installed Claude Code. On a heavy user's
 * machine it is thousands of lines and grows without bound, so this module
 * never materialises the file as one string and never retains a parsed line:
 * it streams fixed-size chunks and folds each line straight into the small
 * {@link PromptEntry} the list needs.
 *
 * The field that makes that mandatory is `pastedContents` — the CLI stores
 * whole pasted files there. A single prompt can carry megabytes. Only its
 * count and character total survive into the model.
 *
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import { StringDecoder } from "string_decoder";
import { HISTORY_FILE } from "../../core/config";
import { createMtimeCache } from "../../core/mtimeCache";
import { openFileNoFollow } from "../../core/safeOpen";
import type { PromptEntry, RawHistoryLine } from "./types";

/**
 * Read size per `readSync`. 64 KB matches the transcript readers elsewhere in
 * the extension; it is large enough that a 1 MB history costs ~16 syscalls and
 * small enough that resident memory stays flat however far the file grows.
 */
const CHUNK_BYTES = 64 * 1024;

/**
 * Prompts the CLI writes but the user never "asked" — the login handshake
 * types itself into history. Filtering it here keeps it out of the list and
 * out of the repeat counts. Matches the sessions parser's exclusion.
 */
const SYNTHETIC_PROMPTS: ReadonlySet<string> = new Set(["/login "]);

/**
 * Last path segment of a project directory, for display.
 *
 * Backslashes are normalised first so a Windows-recorded `C:\Users\me\proj`
 * yields `proj` rather than the whole string.
 */
export function projectNameOf(projectPath: string): string {
  const parts = projectPath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Count of attachments on a `pastedContents` map and their total characters. */
export function measureAttachments(pastedContents: unknown): {
  count: number;
  chars: number;
} {
  if (!pastedContents || typeof pastedContents !== "object") {
    return { count: 0, chars: 0 };
  }
  const values = Object.values(pastedContents as Record<string, unknown>);
  let chars = 0;
  for (const value of values) {
    // Observed shapes: {id, type, content} and {id, type, contentHash}. The
    // hashed form deliberately carries no content — it measures as 0 rather
    // than being reported as missing.
    const content = (value as { content?: unknown } | null)?.content;
    if (typeof content === "string") chars += content.length;
  }
  return { count: values.length, chars };
}

/**
 * Fold one raw history line into a {@link PromptEntry}, or return null when
 * the line carries no prompt text.
 *
 * `lineIndex` is the line's position in the append-only file and becomes part
 * of the entry id. Every field is defended individually: a CLI that renames
 * `project` should cost the user a project label, not the whole list.
 */
export function toPromptEntry(
  raw: RawHistoryLine,
  lineIndex: number,
): PromptEntry | null {
  const text = typeof raw.display === "string" ? raw.display : "";
  if (!text || SYNTHETIC_PROMPTS.has(text)) return null;

  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : "";
  const projectPath = typeof raw.project === "string" ? raw.project : "";
  const timestamp =
    typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : 0;
  const { count, chars } = measureAttachments(raw.pastedContents);

  return {
    id: `${sessionId}#${lineIndex}`,
    text,
    timestamp,
    projectPath,
    projectName: projectNameOf(projectPath),
    sessionId,
    repeatCount: 1,
    attachmentCount: count,
    attachmentChars: chars,
  };
}

/**
 * Collapse runs of consecutive identical prompts into one row carrying a
 * repeat count.
 *
 * Retrying the same text is how people use the CLI — a failing command gets
 * re-sent until it works — and twenty identical rows bury everything around
 * them. A run is only collapsed when the prompts are adjacent in the log AND
 * belong to the same session: two sessions that happen to neighbour each
 * other with the same text are genuinely different rows, and the row's
 * "open session" action would be ambiguous if they were merged.
 *
 * The surviving row keeps the FIRST occurrence's identity (so the key is
 * stable as the run grows) and the LAST occurrence's timestamp (so the list,
 * which is newest-first, sorts the run by when it last happened).
 *
 * `entries` must be in chronological order — i.e. file order.
 */
export function collapseRepeats(entries: PromptEntry[]): PromptEntry[] {
  const out: PromptEntry[] = [];
  for (const entry of entries) {
    const prev = out[out.length - 1];
    if (prev && prev.text === entry.text && prev.sessionId === entry.sessionId) {
      prev.repeatCount++;
      prev.timestamp = entry.timestamp;
      continue;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Stream `filePath` and return every prompt in it, newest first, with
 * consecutive retries collapsed.
 *
 * Missing, unreadable, or symlinked file → `[]`. Malformed lines are skipped
 * individually: the CLI appends while we read, so the final line is routinely
 * torn mid-object, and a half-written line must not cost the user the other
 * four thousand.
 */
export function readPromptHistoryUncached(filePath: string): PromptEntry[] {
  // Symlink-safe: ~/.claude/ is a tree the extension does not own, and a
  // planted link must not make us read (and display) an arbitrary file.
  const fd = openFileNoFollow(filePath);
  if (fd === null) return [];

  const entries: PromptEntry[] = [];
  const buf = Buffer.alloc(CHUNK_BYTES);
  // A chunk boundary can fall inside a multi-byte character. StringDecoder
  // holds the partial bytes back until the next chunk completes them;
  // `buf.toString()` would emit U+FFFD and corrupt any prompt containing
  // non-ASCII text, which is most of them once an emoji is involved.
  const decoder = new StringDecoder("utf8");
  let leftover = "";
  let lineIndex = 0;
  let bytesRead: number;

  const consume = (line: string): void => {
    const index = lineIndex++;
    if (!line.trim()) return;
    let raw: RawHistoryLine;
    try {
      raw = JSON.parse(line) as RawHistoryLine;
    } catch {
      return;
    }
    const entry = toPromptEntry(raw, index);
    if (entry) entries.push(entry);
  };

  try {
    // Loop until readSync reports EOF rather than until a short read: a read
    // that returns less than CHUNK_BYTES mid-file is legal, and treating it
    // as EOF would silently truncate the history.
    while ((bytesRead = fs.readSync(fd, buf, 0, CHUNK_BYTES, null)) > 0) {
      const chunk = leftover + decoder.write(buf.subarray(0, bytesRead));
      const lines = chunk.split("\n");
      // The last element is either an incomplete line or "" — carry it.
      leftover = lines.pop() ?? "";
      for (const line of lines) consume(line);
    }

    // Whatever the decoder still holds plus the unterminated final line. A
    // complete last line without a trailing newline parses here; a torn one
    // throws inside `consume` and is dropped.
    consume(leftover + decoder.end());
  } finally {
    fs.closeSync(fd);
  }

  const collapsed = collapseRepeats(entries);
  // Newest first. Reversing the (chronological) log is not enough on its own:
  // `timestamp` is the CLI's clock and a machine that changed time zones or
  // ran an NTP correction has lines out of order, so sort explicitly and fall
  // back to log order for ties.
  collapsed.reverse();
  collapsed.sort((a, b) => b.timestamp - a.timestamp);
  return collapsed;
}

/**
 * mtime + size keyed cache over {@link readPromptHistoryUncached}.
 *
 * The webview filters the prompt list client-side, so the file is read once
 * per change rather than once per keystroke. This cache is what makes a
 * repeat `getPromptHistory` (tab re-open, refresh, another window) cost one
 * `stat` instead of a full re-stream.
 */
const historyCache = createMtimeCache<PromptEntry[]>();

/**
 * Every prompt in the history file, newest first. Cached until the file's
 * mtime or size changes.
 *
 * `filePath` is a test seam; production callers take the default.
 */
export function readPromptHistory(filePath: string = HISTORY_FILE): PromptEntry[] {
  return historyCache.get(filePath, readPromptHistoryUncached);
}

/** Drop the cached history so the next read re-streams. */
export function clearPromptHistoryCache(): void {
  historyCache.clear();
}
