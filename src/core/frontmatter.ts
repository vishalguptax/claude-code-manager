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
