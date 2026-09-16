/**
 * Portable session helpers — pure functions for export/import.
 *
 * Background: a Claude session lives at
 *   ~/.claude/projects/<slug>/<sessionId>.jsonl
 * where <slug> is the absolute project path with every non-alphanumeric
 * character replaced by `-`. Claude CLI's `--resume <id>` looks up sessions
 * only inside the slug directory matching the *current* working directory.
 * So importing a session requires three things, verified empirically:
 *
 *   1. The internal `sessionId` field on every line must equal the filename.
 *   2. The file must live in the slug directory matching the cwd of the
 *      terminal that runs `claude --resume`.
 *   3. Stale per-message `cwd` fields are tolerated — Claude does not
 *      validate them. They are historical record only.
 *
 * This file owns rules 1 and 2. It is pure (no fs, no vscode) so it can be
 * unit tested in isolation and reused across both export and import flows.
 */
import type { Session } from "./types";

/**
 * Longest slug Claude CLI writes verbatim. Beyond this it truncates and
 * appends a hash so two long sibling paths cannot collide on disk.
 */
const MAX_SLUG_LENGTH = 200;

/**
 * The CLI's string hash: the classic `h * 31 + c` accumulator, kept in
 * int32 by the `| 0` on every step (which is what makes overflow wrap
 * instead of losing precision to float64). Reproduced bit-for-bit
 * because the result is baked into directory names already on disk.
 */
function hash31(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Convert an absolute filesystem path to the directory name Claude CLI uses
 * inside ~/.claude/projects.
 *
 * The rule is the CLI's own, read off the decompiled bundle (v2.1.273) and
 * verified against real directories in ~/.claude/projects: replace **every**
 * non-alphanumeric character with `-`. Not just separators — dots, spaces,
 * underscores, `@`, `+` and non-ASCII all collapse too. A path containing
 * `/.claude-worktrees/` produces `--claude-worktrees-`, the doubled dash
 * coming from the separator plus the dot. The drive letter on Windows
 * produces the same doubling (`C:\` → `C--`).
 *
 * If the sanitized form exceeds 200 characters the CLI truncates it to 200
 * and appends `-<hash>`, where the hash is `hash31` over the *original*
 * path (not the sanitized one) in base 36. That keeps two long paths that
 * share their first 200 sanitized characters in separate directories.
 *
 * The slug must preserve case — Windows directories show both `C--Users-...`
 * and `c--Users-...` depending on how the cwd was capitalized when the
 * session was first created.
 */
export function slugifyProjectPath(absPath: string): string {
  const sanitized = absPath.replace(/[^a-zA-Z0-9]/g, "-");
  if (sanitized.length <= MAX_SLUG_LENGTH) return sanitized;
  return `${sanitized.slice(0, MAX_SLUG_LENGTH)}-${Math.abs(hash31(absPath)).toString(36)}`;
}

/**
 * The shape a truncated slug has: exactly MAX_SLUG_LENGTH sanitized
 * characters, then `-`, then the base-36 hash. `Math.abs` of an int32 is at
 * most 2147483648, which is 6 base-36 digits, so the suffix is 1–6 chars.
 */
const TRUNCATED_SLUG = new RegExp(`^.{${MAX_SLUG_LENGTH}}-[0-9a-z]{1,6}$`);

/**
 * Recover the *shape* of a project path from its slug. This is not an
 * inverse of `slugifyProjectPath` and cannot be one: the slug rule
 * collapses separators, dots, spaces, underscores and every other
 * non-alphanumeric character onto the same `-`, so `a.b`, `a b` and `a/b`
 * all slugify identically. The result is a plausible path, not the path.
 *
 * Only use it for orphan sessions whose JSONL never recorded a `cwd` line
 * — without something to show, Resume has nothing to open. Whenever a real
 * `cwd` is available it wins; never call this in preference to one.
 *
 * Shapes we recognize:
 *
 *  - Windows drive paths: `^([A-Za-z])--(.*)$` → `C:/...` (forward
 *    slashes chosen so both Node and VS Code accept the path).
 *  - Unix paths: leading `-` from the root `/`.
 *
 * Truncated slugs are refused outright. Once the CLI has cut the path at
 * 200 characters and appended a hash, the missing tail is gone and the
 * hash is one-way — any path we produced would be a fabrication with a
 * bogus `-<hash>` segment glued on the end. We return the raw slug
 * instead, and so we do for any shape we don't recognize: showing the
 * slug is honest, inventing a path is not.
 */
export function deslugifyProjectPath(slug: string): string {
  // A short-enough slug can in principle match the truncation shape by
  // coincidence. We accept that false positive: its cost is showing a raw
  // slug instead of a path, which is far cheaper than a fabricated path.
  if (TRUNCATED_SLUG.test(slug)) return slug;

  const windowsMatch = /^([A-Za-z])--(.*)$/.exec(slug);
  if (windowsMatch) {
    return `${windowsMatch[1]}:/${windowsMatch[2].replace(/-/g, "/")}`;
  }
  if (slug.startsWith("-")) {
    return "/" + slug.slice(1).replace(/-/g, "/");
  }
  return slug;
}

/**
 * The result of inspecting a candidate session JSONL string.
 *
 * `ok: true` means the file is structurally a Claude session. `ok: false`
 * carries a short human-readable reason that the import dialog can show
 * verbatim.
 */
export type PortableValidation =
  | { ok: true; sessionId: string; lineCount: number; userMessageCount: number }
  | { ok: false; reason: string };

/**
 * Parse a JSONL string and verify it looks like a real Claude session.
 *
 * Required for import:
 *   - At least one line parses as JSON
 *   - At least one parsed line has a non-empty `sessionId` string
 *   - At least one parsed line is a user message (so the user has something
 *     to resume — an empty session is not useful)
 *   - Every parsed line that has a `sessionId` field uses the *same* id
 *     (mismatched ids would indicate a corrupted or merged file)
 *
 * Returns the canonical sessionId and counts on success, or a precise
 * failure reason on rejection. Never throws.
 */
export function validatePortableSession(content: string): PortableValidation {
  if (!content.trim()) {
    return { ok: false, reason: "File is empty." };
  }

  const lines = content.split("\n");
  let parsedLines = 0;
  let userMessageCount = 0;
  let canonicalId: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Malformed lines abort the import — partial files cause weird
      // half-rewritten state. Better to refuse than guess.
      return {
        ok: false,
        reason: "File contains malformed JSON. It does not look like a Claude session export.",
      };
    }
    parsedLines++;

    if (typeof obj.sessionId === "string" && obj.sessionId.length > 0) {
      if (canonicalId === null) {
        canonicalId = obj.sessionId;
      } else if (obj.sessionId !== canonicalId) {
        return {
          ok: false,
          reason: "File mixes multiple session IDs. Cannot import a merged or corrupted session.",
        };
      }
    }

    const message = obj.message as { role?: unknown } | undefined;
    if (message && message.role === "user") {
      userMessageCount++;
    }
  }

  if (parsedLines === 0) {
    return { ok: false, reason: "File contains no JSON lines." };
  }
  if (canonicalId === null) {
    return {
      ok: false,
      reason: "File has no session ID. It does not look like a Claude session export.",
    };
  }
  if (userMessageCount === 0) {
    return {
      ok: false,
      reason: "Session has no user messages, nothing to resume.",
    };
  }

  return { ok: true, sessionId: canonicalId, lineCount: parsedLines, userMessageCount };
}

/**
 * Rewrite every top-level `sessionId` field in a JSONL string to a new value.
 *
 * Implementation notes:
 *   - Parses each line as JSON, mutates the field, re-serializes. We do
 *     **not** use string `replaceAll(oldId, newId)` because the old UUID
 *     could legitimately appear inside message content (e.g. an assistant
 *     replying "your session id is …") and we must not corrupt that.
 *   - Lines that fail to parse are passed through unchanged. We rely on
 *     `validatePortableSession` having already rejected files with parse
 *     errors before we get here, so this branch is defensive only.
 *   - Line endings are preserved exactly. Trailing newline (if present) is
 *     preserved so the rewritten file byte-matches the source format.
 */
export function rewriteSessionId(
  content: string,
  oldId: string,
  newId: string,
): string {
  if (oldId === newId) return content;

  // Split on \n to preserve every blank line. We rejoin with \n and add
  // back a trailing newline iff the source had one.
  const hadTrailingNewline = content.endsWith("\n");
  const lines = content.split("\n");
  const out: string[] = new Array(lines.length);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      out[i] = line;
      continue;
    }
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (obj.sessionId === oldId) {
        obj.sessionId = newId;
        out[i] = JSON.stringify(obj);
      } else {
        out[i] = line;
      }
    } catch {
      out[i] = line;
    }
  }

  return hadTrailingNewline ? out.join("\n") : out.join("\n").replace(/\n$/, "");
}

/**
 * A project the user can pick as the import target. Holds both the
 * display name (last path segment) and the absolute path used to compute
 * the slug + open the terminal.
 */
export interface KnownProject {
  /** Display label (last path segment) */
  name: string;
  /** Absolute path used for slug + terminal cwd */
  path: string;
}

/**
 * Build a deduped list of {name, path} for every project that has at
 * least one session in the current scan. Sorted alphabetically by name
 * (case-insensitive) so the picker is predictable.
 *
 * We dedupe by `path` (not name) because two different machines can have
 * projects with the same folder name in different parents.
 */
export function getKnownProjects(sessions: Session[]): KnownProject[] {
  const byPath = new Map<string, KnownProject>();
  for (const s of sessions) {
    if (!s.projectPath) continue;
    if (byPath.has(s.projectPath)) continue;
    byPath.set(s.projectPath, { name: s.project, path: s.projectPath });
  }
  return [...byPath.values()].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}

/**
 * Build a default export filename from a session. Pattern:
 *   "<slug-of-name>-<short-id>.claude-session.jsonl"
 *
 * The `.claude-session.jsonl` double-suffix makes the file recognizable in
 * a file manager and in the import file picker filter, while the `.jsonl`
 * extension keeps text editors happy.
 */
export function defaultExportFilename(session: Session): string {
  // Use the friendly label if any, otherwise fall back to the short id
  // alone — never derive the slug from the full session id, that would
  // produce a duplicated `<full-id>-<short-id>` mess.
  const friendly = session.name || session.summary || "";
  const base = friendly
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const shortId = session.id.slice(0, 8);
  const stem = base ? `${base}-${shortId}` : shortId;
  return `${stem}.claude-session.jsonl`;
}
