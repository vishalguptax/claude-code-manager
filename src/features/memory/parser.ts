/**
 * Memory browser parser — reads Claude Code's auto-memory store.
 *
 * ## The on-disk format
 *
 * One fact per file at `~/.claude/projects/<project-slug>/memory/<slug>.md`:
 *
 * ```markdown
 * ---
 * name: check-siblings-and-history-first
 * description: "Before writing a fix, check how sibling code solves it"
 * metadata:
 *   node_type: memory
 *   type: feedback
 *   originSessionId: e66c2065-3a32-4197-ba38-b46852bbd3b0
 *   modified: 2026-08-05T12:00:40.877Z
 * ---
 *
 * Body text, which may reference other memories as [[their-name]].
 * ```
 *
 * `MEMORY.md` in the same directory is the project's index — `- [Title](file.md) — hook`
 * per line, optionally under a `#` heading. It has no frontmatter and is NOT
 * itself a memory.
 *
 * Four things verified against the 35 real memories on this machine that the
 * shape above does not show, each of which breaks a naive reader:
 *
 * 1. `metadata` carries `node_type` and `originSessionId` on every file and
 *    `modified` on 60% of them — not just `type`.
 * 2. `description` is sometimes double-quoted and sometimes bare, and the
 *    quoted ones contain colons and em dashes.
 * 3. **The filename is not the slug.** `feedback_no_workarounds.md` declares
 *    `name: feedback-no-workarounds`. `[[links]]` match `name`, the index
 *    links the *filename*, and conflating the two invents broken links.
 * 4. `metadata:` is written with a trailing space (`"metadata: "`), so a
 *    parser keying on the exact string `"metadata:"` misses the block.
 *
 * ## Why a hand parser and not a YAML dependency
 *
 * Six scalar fields in a fixed two-level shape. A YAML library would ship its
 * whole grammar to every user of the extension for that (CLAUDE.md principle
 * 10), and would still need this file's fallbacks for the malformed cases.
 *
 * ## Trust
 *
 * `~/.claude/projects` is a tree this extension does not own. Project slugs
 * and filenames come from directory listings and from `MEMORY.md` link
 * targets, so both are validated against anchored grammars before any
 * `path.join`, and every read goes through `openFileNoFollow`.
 *
 * ## Cost
 *
 * Listing reads a bounded head of each file, never the whole body — see
 * {@link MEMORY_READ_BYTES}.
 *
 * Pure Node.js file I/O — no VS Code dependency.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PROJECTS_DIR, SETTINGS_FILE } from "../../core/config";
import { openFileNoFollow } from "../../core/safeOpen";
import type {
  MemoryFile,
  MemoryFrontmatter,
  MemoryIndexEntry,
  MemoryLink,
  MemoryProject,
  MemoryStore,
} from "./types";

/** Name of the per-project subdirectory holding memories. */
export const MEMORY_DIR_NAME = "memory";

/** Name of the per-project index file. Not a memory. */
export const MEMORY_INDEX_FILE = "MEMORY.md";

/**
 * How much of a memory file the listing reads.
 *
 * The largest real memory is 3 KB, so in practice this reads every file whole
 * while still bounding a pathological one: a 200 MB file dropped into the
 * directory must not be pulled into the extension host to render one row. A
 * file past the bound is flagged `truncated` rather than silently having its
 * tail — and any `[[links]]` in it — go unreported.
 */
export const MEMORY_READ_BYTES = 64 * 1024;

/** Characters of body kept for the list row's excerpt. */
const EXCERPT_CHARS = 240;

/**
 * Project directory names. Claude Code builds these by replacing the path
 * separators of an absolute path with `-`, so the real charset is
 * alphanumerics plus `-`, `_` and `.`.
 *
 * Anchored, and {@link isSafeSegment} additionally rejects any `..`, so a
 * directory named `..` — or one containing a separator — can never reach a
 * `path.join`.
 */
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/** Memory filenames: a safe segment ending in `.md`. */
const MEMORY_FILE_RE = /^[A-Za-z0-9._-]+\.md$/;

/** `[[target]]` references. Brackets and newlines cannot appear inside. */
const LINK_RE = /\[\[([^[\]\n]+)\]\]/g;

/**
 * One `MEMORY.md` entry: `- [Title](file.md) — hook`.
 *
 * The separator before the hook is optional and may be an em dash, an en
 * dash or a plain hyphen; real indexes use `—`, but a hand-edited one will
 * not necessarily.
 */
const INDEX_LINE_RE = /^\s*[-*]\s+\[([^\]]*)\]\(([^)]*)\)\s*(?:[—–-]\s*)?(.*)$/;

/**
 * True when `name` is a single path component that cannot escape its parent.
 * The charset admits no `/`, `\` or NUL; the explicit `..` check covers the
 * traversal segment itself and names like `..foo` are harmless but rejected
 * with it rather than growing a second rule.
 */
export function isSafeSegment(name: string): boolean {
  return SEGMENT_RE.test(name) && !name.includes("..");
}

/** True when `name` is a memory file we will open. `MEMORY.md` is excluded. */
export function isMemoryFileName(name: string): boolean {
  return (
    MEMORY_FILE_RE.test(name) && !name.includes("..") && name !== MEMORY_INDEX_FILE
  );
}

/** Strip one layer of matching surrounding quotes from a scalar value. */
function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2) {
    const first = v[0];
    if ((first === '"' || first === "'") && v[v.length - 1] === first) {
      return v.slice(1, -1);
    }
  }
  return v;
}

/** An all-empty frontmatter record, used as the base for every parse. */
function emptyFrontmatter(): MemoryFrontmatter {
  return {
    name: "",
    description: "",
    type: "",
    nodeType: "",
    originSessionId: "",
    modified: "",
  };
}

/**
 * Split a memory file's head into its frontmatter fields and its body.
 *
 * The grammar handled is exactly what Claude Code writes: a `---` fence on
 * the first line, `key: value` lines at column 0, a two-space-indented block
 * under `metadata:`, and a closing `---`. Anything else inside the fence —
 * a comment, a list, a line without a colon — is skipped rather than failing
 * the parse, because a partially readable memory is still worth showing.
 *
 * With no opening fence, or no closing one, `hasFrontmatter` is false and the
 * entire text is the body. That is the honest reading of a truncated file:
 * we did not find frontmatter, so we do not pretend to have parsed any.
 */
export function parseFrontmatter(raw: string): {
  meta: MemoryFrontmatter;
  body: string;
  hasFrontmatter: boolean;
} {
  const meta = emptyFrontmatter();
  // Tolerate a UTF-8 BOM and CRLF line endings; both survive a round trip
  // through an editor that a user may well have opened the file in.
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  if (lines[0]?.trim() !== "---") return { meta, body: text, hasFrontmatter: false };

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { meta, body: text, hasFrontmatter: false };

  // Which top-level key an indented line belongs to. Only `metadata` has a
  // nested block in this format; anything else's children are ignored.
  let parent = "";
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const indented = /^\s/.test(line);
    const key = line.slice(0, colon).trim();
    const value = unquote(line.slice(colon + 1));

    if (!indented) {
      parent = key;
      if (key === "name") meta.name = value;
      else if (key === "description") meta.description = value;
      continue;
    }
    if (parent !== "metadata") continue;
    if (key === "type") meta.type = value;
    else if (key === "node_type") meta.nodeType = value;
    else if (key === "originSessionId") meta.originSessionId = value;
    else if (key === "modified") meta.modified = value;
  }

  return {
    meta,
    body: lines.slice(end + 1).join("\n"),
    hasFrontmatter: true,
  };
}

/**
 * Every `[[target]]` in `body`, deduped, in first-seen order.
 *
 * Order is preserved rather than sorted so the detail view can list a
 * memory's references the way its author wrote them.
 */
export function extractLinks(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(LINK_RE)) {
    const target = match[1].trim();
    if (target === "" || seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}

/**
 * The first paragraph of `body`, whitespace-collapsed and capped at
 * {@link EXCERPT_CHARS}. Markdown is left as written: the row shows what the
 * file says, and rendering it would mean shipping a markdown parser to draw
 * two lines of preview.
 */
export function buildExcerpt(body: string): string {
  const paragraph = body.trim().split(/\n\s*\n/)[0] ?? "";
  const flat = paragraph.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS).trimEnd()}…` : flat;
}

/**
 * Parse a `MEMORY.md` index into its entries.
 *
 * `resolved` is left false here — it depends on the directory listing, which
 * this pure function does not have. {@link buildProject} fills it in.
 */
export function parseMemoryIndex(raw: string): MemoryIndexEntry[] {
  const out: MemoryIndexEntry[] = [];
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    const m = INDEX_LINE_RE.exec(line);
    if (!m) continue;
    const fileName = m[2].trim();
    if (fileName === "") continue;
    out.push({
      title: m[1].trim(),
      fileName,
      hook: m[3].trim(),
      resolved: false,
    });
  }
  return out;
}

/**
 * Fill in the two derived signals that make this browser worth having:
 * link resolution and orphanhood.
 *
 * A link resolves against another memory's `name`, never its filename — see
 * the module header. A **self-link does not count as an inbound reference**:
 * `list-remaining-after-commit.md` really does link to itself in the store on
 * this machine, and counting that would mark it non-orphaned on its own say-so.
 *
 * Both inputs are mutated in place; they were built by the caller one line
 * earlier and are not shared.
 */
export function resolveGraph(
  memories: MemoryFile[],
  index: MemoryIndexEntry[],
): { brokenLinks: string[]; orphanCount: number } {
  const byName = new Map<string, MemoryFile>();
  for (const m of memories) {
    // First writer wins: two files declaring the same `name` is malformed,
    // and silently letting the later one shadow the earlier would make the
    // earlier look orphaned.
    if (!byName.has(m.meta.name)) byName.set(m.meta.name, m);
  }
  const fileNames = new Set(memories.map((m) => m.fileName));
  const indexed = new Set<string>();
  for (const entry of index) {
    entry.resolved = fileNames.has(entry.fileName);
    if (entry.resolved) indexed.add(entry.fileName);
  }

  const inbound = new Map<string, number>();
  const broken = new Set<string>();
  for (const m of memories) {
    for (const link of m.links) {
      const target = byName.get(link.target);
      link.resolved = target !== undefined;
      if (target === undefined) {
        broken.add(link.target);
        continue;
      }
      if (target.id === m.id) continue; // self-link: not an inbound reference
      inbound.set(target.id, (inbound.get(target.id) ?? 0) + 1);
    }
  }

  let orphanCount = 0;
  for (const m of memories) {
    m.inboundCount = inbound.get(m.id) ?? 0;
    m.indexed = indexed.has(m.fileName);
    m.orphan = m.inboundCount === 0 && !m.indexed;
    if (m.orphan) orphanCount++;
  }

  return { brokenLinks: [...broken].sort(), orphanCount };
}

/**
 * Read at most `maxBytes` from `filePath`, refusing symlinks.
 *
 * Returns `null` for every unreadable outcome — missing, a symlink, a
 * directory, permission denied. Callers treat that as "not a memory",
 * never as an error to surface.
 */
export function readHead(
  filePath: string,
  maxBytes: number = MEMORY_READ_BYTES,
): { text: string; sizeBytes: number; mtimeMs: number; truncated: boolean } | null {
  const fd = openFileNoFollow(filePath);
  if (fd === null) return null;
  try {
    const stat = fs.fstatSync(fd);
    const want = Math.min(stat.size, maxBytes);
    const buf = Buffer.alloc(want);
    let read = 0;
    // readSync can return a short count on a large file; loop until the
    // requested window is filled or the file ends.
    while (read < want) {
      const n = fs.readSync(fd, buf, read, want - read, read);
      if (n <= 0) break;
      read += n;
    }
    return {
      text: buf.subarray(0, read).toString("utf-8"),
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      truncated: stat.size > maxBytes,
    };
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/** Expand a leading `~` in a user-supplied settings path. */
function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

/**
 * Claude Code's two auto-memory settings, read from `~/.claude/settings.json`.
 *
 * `autoMemoryEnabled` defaults to true (it is opt-out, matching the default
 * the account parser already uses). `autoMemoryDirectory` relocates the
 * store; an unreadable or absent settings file means "defaults", never an
 * error — this extension is a viewer and a missing settings file is normal.
 *
 * The read shares {@link MEMORY_READ_BYTES}. A settings.json past that bound
 * would parse as truncated JSON and fall back to the defaults, which is the
 * same outcome as an unreadable file; real ones are a couple of kilobytes.
 */
export function readMemorySettings(): { enabled: boolean; directory: string | null } {
  const head = readHead(SETTINGS_FILE);
  if (head === null) return { enabled: true, directory: null };
  let parsed: { autoMemoryEnabled?: unknown; autoMemoryDirectory?: unknown };
  try {
    parsed = JSON.parse(head.text) as typeof parsed;
  } catch {
    return { enabled: true, directory: null };
  }
  const directory =
    typeof parsed.autoMemoryDirectory === "string" && parsed.autoMemoryDirectory.trim() !== ""
      ? expandHome(parsed.autoMemoryDirectory.trim())
      : null;
  return { enabled: parsed.autoMemoryEnabled !== false, directory };
}

/**
 * The directory whose subdirectories are searched for a `memory` folder.
 *
 * Defaults to `~/.claude/projects`; `autoMemoryDirectory` replaces it
 * wholesale. A relocated root that does not exist yields no projects — the
 * store is simply somewhere we cannot see, which is an empty state, not a
 * failure.
 */
export function memoryRoot(): string {
  return readMemorySettings().directory ?? PROJECTS_DIR;
}

/**
 * Best-effort human label for a project slug.
 *
 * The slug is an absolute path with its separators replaced by `-`, which is
 * lossy: `-Users-me-claude-code-manager` could be `.../claude/code/manager` or
 * `.../claude-code-manager`. Rather than guess, we walk the segments against
 * the real filesystem, taking the shortest join that exists at each step, and
 * return the final component. When the project directory is gone — a deleted
 * repo whose memories outlived it — there is nothing to walk and the slug
 * itself is the honest label.
 */
export function decodeProjectLabel(slug: string): string {
  const segments = slug.replace(/^-/, "").split("-");
  let current: string = path.sep;
  let last = "";
  let i = 0;
  while (i < segments.length) {
    let matched = false;
    let candidate = "";
    for (let take = 1; i + take <= segments.length; take++) {
      candidate = segments.slice(i, i + take).join("-");
      const next = path.join(current, candidate);
      try {
        if (fs.statSync(next).isDirectory()) {
          current = next;
          last = candidate;
          i += take;
          matched = true;
          break;
        }
      } catch {
        // Not a directory at this depth — try one more segment.
      }
    }
    if (!matched) return last === "" ? slug : last;
  }
  return last === "" ? slug : last;
}

/** Parse one memory file into a record, or `null` when it cannot be read. */
function buildMemory(project: string, dir: string, fileName: string): MemoryFile | null {
  const filePath = path.join(dir, fileName);
  const head = readHead(filePath);
  if (head === null) return null;
  const { meta, body, hasFrontmatter } = parseFrontmatter(head.text);
  // A file with no `name:` is still a memory and still a link target for
  // anyone who guessed its filename, so fall back to the stem rather than
  // leaving it unaddressable.
  if (meta.name === "") meta.name = fileName.slice(0, -3);
  const links: MemoryLink[] = extractLinks(body).map((target) => ({
    target,
    resolved: false,
  }));
  return {
    project,
    fileName,
    path: filePath,
    id: `${project}/${fileName}`,
    meta,
    hasFrontmatter,
    excerpt: buildExcerpt(body),
    links,
    inboundCount: 0,
    indexed: false,
    orphan: false,
    truncated: head.truncated,
    sizeBytes: head.sizeBytes,
    mtimeMs: head.mtimeMs,
  };
}

/**
 * Build one project's memory picture from its directory.
 *
 * Returns `null` when the directory holds no memories at all. A project
 * whose `memory/` folder exists but is empty — real on this machine — is not
 * worth a row.
 */
export function buildProject(slug: string, dir: string): MemoryProject | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const memories: MemoryFile[] = [];
  let hasIndex = false;
  let indexRaw = "";
  for (const entry of entries) {
    // isFile() is false for a symlink dirent, so a linked "memory" never
    // reaches readHead. readHead refuses it a second time regardless.
    if (!entry.isFile()) continue;
    if (entry.name === MEMORY_INDEX_FILE) {
      hasIndex = true;
      indexRaw = readHead(path.join(dir, entry.name))?.text ?? "";
      continue;
    }
    if (!isMemoryFileName(entry.name)) continue;
    const memory = buildMemory(slug, dir, entry.name);
    if (memory !== null) memories.push(memory);
  }

  if (memories.length === 0) return null;

  const index = parseMemoryIndex(indexRaw);
  const { brokenLinks, orphanCount } = resolveGraph(memories, index);
  memories.sort((a, b) => b.mtimeMs - a.mtimeMs || a.fileName.localeCompare(b.fileName));

  return {
    slug,
    label: decodeProjectLabel(slug),
    dir,
    memories,
    index,
    hasIndex,
    brokenLinks,
    orphanCount,
  };
}

/**
 * The absolute path of a project's memory directory, or `null` when the slug
 * is not a safe single path component. Exported because the command handlers
 * need the same guard before they touch a webview-supplied slug.
 */
export function memoryDirFor(slug: string, root: string = memoryRoot()): string | null {
  if (!isSafeSegment(slug)) return null;
  return path.join(root, slug, MEMORY_DIR_NAME);
}

/**
 * Absolute path of one memory file, or `null` when either component fails
 * its grammar. This is the single place a webview-supplied `(project, file)`
 * pair becomes a path, so it is the single place traversal is stopped.
 */
export function memoryPathFor(
  slug: string,
  fileName: string,
  root: string = memoryRoot(),
): string | null {
  const dir = memoryDirFor(slug, root);
  if (dir === null || !isMemoryFileName(fileName)) return null;
  return path.join(dir, fileName);
}

/**
 * Load the whole store: every project under the memory root that has a
 * non-empty `memory` directory.
 *
 * Never throws. A missing root, a relocated root, or auto-memory switched off
 * all produce an empty project list with the reason attached, so the view can
 * say why it is empty instead of showing a bare "nothing here".
 */
export function loadMemoryStore(): MemoryStore {
  const { enabled, directory } = readMemorySettings();
  const root = directory ?? PROJECTS_DIR;
  if (!enabled) return { enabled: false, root, projects: [] };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { enabled: true, root, projects: [] };
  }

  const projects: MemoryProject[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeSegment(entry.name)) continue;
    const project = buildProject(entry.name, path.join(root, entry.name, MEMORY_DIR_NAME));
    if (project !== null) projects.push(project);
  }

  projects.sort((a, b) => a.label.localeCompare(b.label));
  return { enabled: true, root, projects };
}
