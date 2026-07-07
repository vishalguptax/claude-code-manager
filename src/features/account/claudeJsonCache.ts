/**
 * mtime+size-cached reader for `~/.claude.json`.
 *
 * `~/.claude.json` is the Claude CLI's main config — it accumulates per-project
 * history, `pastedContents`, and MCP config, so it is routinely several MB (tens
 * of MB for heavy users). The account-watcher tick reads and JSON-parses it 2-3
 * times per fire (parseProfile + readLiveIdentity + getActiveProfileSlug), and
 * the throttled usage re-push reads it again — all synchronously on the
 * extension-host event loop. Re-parsing a multi-MB blob several times per tick
 * froze every panel.
 *
 * Built on the shared {@link createMtimeCache}: the file is read AND parsed at
 * most once per (mtimeMs, size). Repeated reads within a tick, and across ticks
 * where the file did not change, are served from memory. The cache self-
 * invalidates whenever the CLI rewrites the file, so callers always see current
 * data.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createMtimeCache } from "../../core/mtimeCache";

// Computed locally from os.homedir() to match parser.ts / profiles.ts (which
// tests redirect by mocking `os`); avoids a hard dependency on the core/config
// module that the account tests replace wholesale.
const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");

interface ParsedClaudeJson {
  /** Raw file contents, or null when missing / unreadable. */
  raw: string | null;
  /** Parsed object, or null when missing / empty / corrupt / not an object. */
  parsed: Record<string, unknown> | null;
}

const cache = createMtimeCache<ParsedClaudeJson>();

function read(): ParsedClaudeJson {
  return cache.get(CLAUDE_JSON, (filePath) => {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf-8");
    } catch {
      return { raw: null, parsed: null };
    }
    let parsed: Record<string, unknown> | null = null;
    if (raw.trim()) {
      try {
        const obj = JSON.parse(raw) as unknown;
        if (obj && typeof obj === "object") parsed = obj as Record<string, unknown>;
      } catch {
        // Corrupt JSON — parsed stays null; callers fall back to backups.
      }
    }
    return { raw, parsed };
  });
}

/** Raw `~/.claude.json` contents, or null when missing/unreadable. */
export function readClaudeJsonRaw(): string | null {
  return read().raw;
}

/**
 * Parsed `~/.claude.json`, or null when missing/empty/corrupt/not a JSON object.
 * Parses at most once per (mtimeMs, size).
 */
export function readClaudeJsonParsed(): Record<string, unknown> | null {
  return read().parsed;
}

/** Drop the cache. Not required for correctness (mtime-keyed); lets a hard
 *  reload force a cold read. */
export function clearClaudeJsonCache(): void {
  cache.clear();
}
