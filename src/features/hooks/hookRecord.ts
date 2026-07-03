/**
 * Shared representation of a hook's underlying JSON record — the
 * `{ type, command, timeout, ... }` object nested inside a
 * settings.json hooks entry (or the entry itself, for the legacy flat
 * `{ matcher, command }` shape). Read by the parser, located by the
 * writer — kept in one place so their identity semantics (what counts
 * as "the same hook") never drift apart.
 */

export interface HookRecord {
  type?: string;
  command?: string;
  prompt?: string;
  url?: string;
  tool?: string;
  timeout?: number;
  [key: string]: unknown;
}

export interface RawHookEntry extends HookRecord {
  matcher?: string;
  hooks?: HookRecord[];
}

/** The action type of a hook record, defaulting to "command". */
export function hookRecordType(rec: HookRecord): string {
  return typeof rec.type === "string" ? rec.type : "command";
}

/**
 * The display/identity string for a hook record: its command for
 * "command" hooks, or prompt/url/tool text for other action types.
 * Empty when the record has none of these (malformed — skipped by
 * both the parser and the writer's matcher).
 */
export function hookRecordIdentity(rec: HookRecord): string {
  if (typeof rec.command === "string" && rec.command) return rec.command;
  if (typeof rec.prompt === "string" && rec.prompt) return rec.prompt;
  if (typeof rec.url === "string" && rec.url) return rec.url;
  if (typeof rec.tool === "string" && rec.tool) return rec.tool;
  return "";
}

export function hookRecordTimeout(rec: HookRecord): number | undefined {
  return typeof rec.timeout === "number" ? rec.timeout : undefined;
}
