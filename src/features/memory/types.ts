/**
 * Domain types for the Memory browser.
 *
 * Claude Code's auto-memory store lives at
 * `~/.claude/projects/<project-slug>/memory/*.md` — one fact per file, YAML
 * frontmatter then a markdown body. `MEMORY.md` in the same directory is the
 * per-project index, not a memory.
 *
 * Everything here crosses the postMessage boundary, so every field is plain
 * JSON — no Date, no Map, no class instance.
 */

/**
 * The frontmatter block of one memory file, as parsed.
 *
 * Every field is optional in the type because every field is optional on
 * disk: a hand-edited or truncated file is a normal thing to find, and the
 * browser's job is to show it, not to reject it.
 */
export interface MemoryFrontmatter {
  /**
   * The `name:` slug. This — NOT the filename — is what `[[links]]` resolve
   * against. Real data has files whose stem differs from their name
   * (`feedback_no_workarounds.md` declares `name: feedback-no-workarounds`),
   * so resolving by filename would report false broken links.
   */
  name: string;
  description: string;
  /**
   * `metadata.type`, verbatim. `""` when absent.
   *
   * Deliberately `string` and not a union of the four values Claude Code
   * writes today (feedback, project, reference, and the documented-but-
   * unobserved user): a memory tagged with a type this extension has never
   * seen must still be listed, not dropped or coerced.
   */
  type: string;
  /** `metadata.node_type`, verbatim. Always `"memory"` in real data. */
  nodeType: string;
  /** `metadata.originSessionId` — the session that wrote the memory. */
  originSessionId: string;
  /** `metadata.modified` ISO timestamp. Present on ~60% of real files. */
  modified: string;
}

/** One `[[target]]` reference found in a memory body. */
export interface MemoryLink {
  /** The slug inside the brackets. */
  target: string;
  /** True when a memory in the same project declares `name: <target>`. */
  resolved: boolean;
}

/** One parsed memory file. */
export interface MemoryFile {
  /** Owning project slug (the directory name under the memory root). */
  project: string;
  /** Filename including the `.md` extension. */
  fileName: string;
  /** Absolute path on disk. */
  path: string;
  /**
   * Stable id for keys and selection: `<project>/<fileName>`. Unique across
   * projects, unlike `name`, which is only unique within one.
   */
  id: string;
  /** Frontmatter fields; `name` falls back to the filename stem when absent. */
  meta: MemoryFrontmatter;
  /**
   * False when the file has no `---` frontmatter block at all. The file still
   * appears in the list — it is surfaced as malformed, not hidden.
   */
  hasFrontmatter: boolean;
  /** First paragraph of the body, trimmed to a bounded length. */
  excerpt: string;
  /** Every `[[link]]` in the body, deduped, in first-seen order. */
  links: MemoryLink[];
  /** How many OTHER memories in the project link to this one. Self-links excluded. */
  inboundCount: number;
  /** True when `MEMORY.md` has an entry pointing at this file. */
  indexed: boolean;
  /**
   * Nothing links here and the index does not list it — the memory is only
   * reachable by reading the directory. `inboundCount === 0 && !indexed`.
   */
  orphan: boolean;
  /**
   * True when the file is longer than the listing read bound, so `links` and
   * `excerpt` describe only its head. Unreachable with real data (the largest
   * memory on disk is 3 KB against a 64 KB bound) but flagged rather than
   * silently under-reported.
   */
  truncated: boolean;
  sizeBytes: number;
  /** Last-modified time, epoch ms. Falls back to 0 when the stat fails. */
  mtimeMs: number;
}

/** One line of a project's `MEMORY.md` index. */
export interface MemoryIndexEntry {
  /** Link text — a human title, not a slug. */
  title: string;
  /** Link target, a filename relative to the memory directory. */
  fileName: string;
  /** The trailing hook after the em dash. `""` when the line has none. */
  hook: string;
  /** False when no file of that name is in the directory. */
  resolved: boolean;
}

/** Every memory in one project, plus its index and derived health signals. */
export interface MemoryProject {
  /** Directory name under the memory root, e.g. `-Users-me-code-myrepo`. */
  slug: string;
  /** Best-effort human label — the project's folder name, else the slug. */
  label: string;
  /** Absolute path of the `memory` directory. */
  dir: string;
  /** Sorted by most recently modified first. */
  memories: MemoryFile[];
  /** Parsed `MEMORY.md` lines. Empty when the project has no index. */
  index: MemoryIndexEntry[];
  /** True when a `MEMORY.md` exists, even if it parsed to zero entries. */
  hasIndex: boolean;
  /** Distinct unresolved `[[link]]` targets across the project. */
  brokenLinks: string[];
  /** How many of `memories` are orphans. */
  orphanCount: number;
}

/**
 * The whole store. `enabled` is false when Claude Code's
 * `autoMemoryEnabled` setting is off; `root` is where we looked, so the
 * empty state can say so rather than just showing nothing.
 */
export interface MemoryStore {
  enabled: boolean;
  root: string;
  projects: MemoryProject[];
}

/** Outcome of a delete attempt, reported back to the caller. */
export interface MemoryDeleteResult {
  ok: boolean;
  /** Why it did not happen. `"cancelled"` when the user declined the modal. */
  reason?: "cancelled" | "invalid" | "missing" | "delete-failed";
}

/**
 * Webview → host messages this feature owns.
 *
 * These are NOT yet variants of the shared `Message` union in
 * `src/shared/protocol/messages.ts`, so `messageHandlers.ts` validates them
 * itself rather than leaning on the shared valibot parser. Once the shared
 * union carries them, {@link parseMemoryMessage} collapses to a `switch` on
 * an already-narrowed type — the runtime checks here exist so this feature is
 * safe in the meantime, not because a second protocol is wanted.
 */
export type MemoryRequest =
  | { type: "getMemories" }
  | { type: "openMemory"; project: string; fileName: string }
  | { type: "revealMemory"; project: string; fileName: string }
  | { type: "deleteMemory"; project: string; fileName: string };

/** Host → webview messages this feature sends. */
export type MemoryResponse = { type: "memoryStore"; data: MemoryStore };
