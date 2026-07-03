/**
 * Shared YAML frontmatter parser for Claude Code markdown artifacts
 * (agents, skills). Handles the subset of YAML those files actually
 * use: scalars (plain, quoted, block `|`/`>` with chomping), inline
 * flow lists (`[a, "b"]`), block lists (`- item`), inline `# comments`,
 * and CRLF line endings. Nested maps are not supported — unknown
 * structures are skipped, never thrown on. The parser is total.
 *
 * Pure TS, no vscode import (src/core contract).
 */

export interface Frontmatter {
  /** Top-level scalar/list fields. Nested maps are not supported. */
  fields: Record<string, string | string[]>;
  /** Markdown body after the closing fence (raw input if no frontmatter). */
  body: string;
  hasFrontmatter: boolean;
}

/** Read a field as a scalar string. Lists and absent keys yield undefined. */
export function fmString(fm: Frontmatter, key: string): string | undefined {
  const value = fm.fields[key];
  return typeof value === "string" ? value : undefined;
}

/** Read a field as a list. Scalars and absent keys yield undefined. */
export function fmList(fm: Frontmatter, key: string): string[] | undefined {
  const value = fm.fields[key];
  return Array.isArray(value) ? value : undefined;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Top-level `key: value` row. Anchored at column 0 so nested map lines are skipped. */
const KEY_VALUE = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;

/** Block-scalar marker (`|`, `>`) with optional chomping indicator. */
const BLOCK_SCALAR = /^([|>])([+-]?)\s*$/;

/** A sequence item: `- value` at any indentation (YAML allows column 0 under a key). */
const LIST_ITEM = /^\s*-\s+(.*)$/;

export function parseFrontmatter(raw: string): Frontmatter {
  const match = raw.match(FENCE);
  if (!match) {
    return { fields: {}, body: raw, hasFrontmatter: false };
  }

  const fields: Record<string, string | string[]> = {};
  const lines = match[1].split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const kvMatch = lines[i].match(KEY_VALUE);
    if (!kvMatch) continue;
    const key = kvMatch[1];
    const rawValue = kvMatch[2];

    // Block scalar — consume follow-up indented lines. `>` folds
    // newlines to spaces; `|` preserves them. `-` / `+` chomp
    // trailing newlines (we trim trailing whitespace anyway).
    const scalarMatch = rawValue.match(BLOCK_SCALAR);
    if (scalarMatch) {
      const [joined, consumedUpTo] = collectBlockScalar(lines, i + 1, scalarMatch[1] === ">");
      fields[key] = joined;
      i = consumedUpTo;
      continue;
    }

    const value = stripComment(rawValue).trim();

    // Empty value — either a block list on the following lines, or
    // an empty scalar (also where nested maps land: their indented
    // lines fail KEY_VALUE and are skipped).
    if (value === "") {
      const [items, consumedUpTo] = collectBlockList(lines, i + 1);
      if (items !== null) {
        fields[key] = items;
        i = consumedUpTo;
      } else {
        fields[key] = "";
      }
      continue;
    }

    // Inline flow list: [a, "b", 'c']
    if (value.startsWith("[") && value.endsWith("]")) {
      fields[key] = splitFlowList(value.slice(1, -1));
      continue;
    }

    fields[key] = unquote(value);
  }

  return { fields, body: match[2], hasFrontmatter: true };
}

/**
 * Cut an inline `# comment` from a scalar row. YAML comments require
 * the `#` to start the value or follow whitespace, and quoted spans
 * protect their contents (`"a # b"` is not a comment).
 */
function stripComment(value: string): string {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#" && (i === 0 || value[i - 1] === " " || value[i - 1] === "\t")) {
      return value.slice(0, i);
    }
  }
  return value;
}

/** Strip one pair of matching surrounding quotes, if present. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value[value.length - 1] === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Collect a block scalar's indented follow-up lines starting at
 * `start`. Returns the joined text and the index of the last consumed
 * line (for the caller's loop variable).
 */
function collectBlockScalar(lines: string[], start: number, fold: boolean): [string, number] {
  const collected: string[] = [];
  let baseIndent = -1;
  let j = start;
  while (j < lines.length) {
    const next = lines[j];
    if (!next.trim()) {
      collected.push("");
      j++;
      continue;
    }
    const indent = (next.match(/^(\s*)/) ?? ["", ""])[1].length;
    if (baseIndent < 0) baseIndent = indent;
    if (indent < baseIndent || indent === 0) break;
    collected.push(next.slice(baseIndent));
    j++;
  }
  const joined = fold
    ? collected.join(" ").replace(/\s+/g, " ").trim()
    : collected.join("\n").trim();
  return [joined, j - 1];
}

/**
 * Collect a block list (`- item` rows) starting at `start`. Returns
 * `null` when the following line is not a list item — the key was an
 * empty scalar (or a nested map, which we skip). Blank lines inside
 * the list are allowed; the list ends at the first non-blank,
 * non-item line.
 */
function collectBlockList(lines: string[], start: number): [string[] | null, number] {
  let j = start;
  // Skip leading blanks between the key and its first item.
  while (j < lines.length && !lines[j].trim()) j++;
  if (j >= lines.length || !LIST_ITEM.test(lines[j])) {
    return [null, start - 1];
  }

  const items: string[] = [];
  let lastItemLine = j;
  while (j < lines.length) {
    const line = lines[j];
    if (!line.trim()) {
      j++;
      continue;
    }
    const itemMatch = line.match(LIST_ITEM);
    if (!itemMatch) break;
    const item = unquote(stripComment(itemMatch[1]).trim());
    if (item) items.push(item);
    lastItemLine = j;
    j++;
  }
  return [items, lastItemLine];
}

// ── Serialization (inverse of parseFrontmatter) ──

/**
 * Quote a scalar value when YAML would otherwise mis-read it: empty,
 * leading/trailing space, or containing `:`/`#`/quotes/brackets. Uses
 * double quotes and escapes any embedded double quote.
 */
function quoteScalar(value: string): string {
  const needsQuote =
    value === "" ||
    value !== value.trim() ||
    /[:#"'\[\]{}]|^[-?&*!|>%@`]/.test(value);
  if (!needsQuote) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** Render one field as a `key: value` line (scalar) or inline flow list. */
function serializeField(key: string, value: string | string[]): string {
  if (Array.isArray(value)) {
    return `${key}: [${value.map(quoteScalar).join(", ")}]`;
  }
  return `${key}: ${quoteScalar(value)}`;
}

/**
 * Serialize a fields map into a complete frontmatter document
 * (`---\n…\n---\n`) followed by `body`. Used to CREATE a new artifact
 * from scratch — insertion order of `fields` is preserved. For editing
 * an existing file use {@link updateFrontmatterFields}, which preserves
 * unknown fields and formatting.
 */
export function serializeFrontmatter(
  fields: Record<string, string | string[]>,
  body = "",
): string {
  const lines = Object.entries(fields).map(([k, v]) => serializeField(k, v));
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

/**
 * Rewrite only the named keys inside an existing document's frontmatter,
 * preserving every other line (unknown fields, comments, nested maps)
 * and the markdown body verbatim. A key set to `undefined` is removed;
 * a key not already present is appended before the closing fence. This
 * is the lossless edit path — the frontmatter equivalent of the hooks
 * writer's in-place mutation, so fields the UI doesn't manage (e.g.
 * `permissionMode`, `color`, nested `hooks:`) survive an edit.
 *
 * When `raw` has no frontmatter fence, a fresh block is prepended.
 */
export function updateFrontmatterFields(
  raw: string,
  updates: Record<string, string | string[] | undefined>,
): string {
  const match = raw.match(FENCE);
  if (!match) {
    const present: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(updates)) if (v !== undefined) present[k] = v;
    return serializeFrontmatter(present, raw);
  }

  const eol = /\r\n/.test(raw) ? "\r\n" : "\n";
  const block = match[1].split(/\r?\n/);
  const remaining = new Map(Object.entries(updates));
  const out: string[] = [];

  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    const kv = line.match(KEY_VALUE);
    const key = kv?.[1];
    if (!key || !remaining.has(key)) {
      out.push(line);
      continue;
    }

    // This key is being updated/removed. Skip its value AND any
    // continuation lines (block scalar or block list) that belong to it
    // so we don't leave orphaned indented content behind.
    const value = remaining.get(key);
    remaining.delete(key);
    i = skipFieldContinuation(block, i);
    if (value !== undefined) out.push(serializeField(key, value));
  }

  // Append keys that weren't already present.
  for (const [key, value] of remaining) {
    if (value !== undefined) out.push(serializeField(key, value));
  }

  const bodyStart = raw.length - match[2].length;
  const body = raw.slice(bodyStart);
  return `---${eol}${out.join(eol)}${eol}---${eol}${body}`;
}

/**
 * Given the index of a `key:` line, return the index of the last line
 * that belongs to that field (its block-scalar or block-list
 * continuation), or `start` itself for a plain single-line value.
 */
function skipFieldContinuation(lines: string[], start: number): number {
  const kv = lines[start].match(KEY_VALUE);
  const rawValue = kv?.[2] ?? "";
  if (BLOCK_SCALAR.test(rawValue)) {
    return collectBlockScalar(lines, start + 1, true)[1];
  }
  if (stripComment(rawValue).trim() === "") {
    const [items, consumedUpTo] = collectBlockList(lines, start + 1);
    if (items !== null) return consumedUpTo;
  }
  return start;
}

/** Split a flow-list body on commas outside quotes; unquote each item. */
function splitFlowList(body: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  items.push(current);
  return items.map((item) => unquote(item.trim())).filter(Boolean);
}
