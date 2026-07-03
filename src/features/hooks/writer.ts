/**
 * Hook mutation helpers — toggle, delete, update, and add hook
 * entries inside a Claude settings.json file. Operates on whichever
 * scope's settings file the caller passes (resolved upstream by the
 * shared `resolveSettingsPath`).
 *
 * Why two blocks (`hooks` + `_disabled_hooks`)? Claude CLI ignores
 * unknown top-level keys, so parking disabled entries under a
 * sibling block is a clean way to preserve their bytes (matcher,
 * command, nested-hooks shape) without clearing them on toggle. Re-
 * enabling is then a structural move, not a re-author.
 */
import * as fs from "fs";
import * as path from "path";
import { writeFileAtomic } from "../../core/atomicWrite";
import { hookRecordIdentity, hookRecordType, type HookRecord, type RawHookEntry } from "./hookRecord";
import type { Hook } from "./types";

interface SettingsShape {
  hooks?: Record<string, RawHookEntry[]>;
  _disabled_hooks?: Record<string, RawHookEntry[]>;
  [key: string]: unknown;
}

function readSettings(filePath: string): SettingsShape {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SettingsShape;
    }
  } catch {
    // Missing / unparseable — caller proceeds with a fresh shape.
  }
  return {};
}

function writeSettings(filePath: string, data: SettingsShape): boolean {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, JSON.stringify(data, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

interface Located {
  arr: RawHookEntry[];
  entryIndex: number;
  entry: RawHookEntry;
  /** The record holding type/command/timeout — `entry` itself for the
   *  flat shape, or `entry.hooks[commandIndex]` for the nested shape. */
  record: HookRecord;
  commandIndex: number | null;
}

function recordMatches(record: unknown, hook: Hook): boolean {
  if (!record || typeof record !== "object") return false;
  const rec = record as HookRecord;
  if (hookRecordType(rec) !== hook.hookType) return false;
  return hookRecordIdentity(rec) === hook.command;
}

/** Try the hook's own entryIndex/commandIndex snapshot first. */
function tryLocateAt(arr: RawHookEntry[], hook: Hook): Located | null {
  const entry = arr[hook.entryIndex];
  if (!entry || typeof entry !== "object") return null;
  const entryMatcher = typeof entry.matcher === "string" ? entry.matcher : "";
  if (entryMatcher !== hook.matcher) return null;

  if (hook.commandIndex !== null) {
    if (!Array.isArray(entry.hooks)) return null;
    const record = entry.hooks[hook.commandIndex];
    if (!recordMatches(record, hook)) return null;
    return { arr, entryIndex: hook.entryIndex, entry, record, commandIndex: hook.commandIndex };
  }

  if (!recordMatches(entry, hook)) return null;
  return { arr, entryIndex: hook.entryIndex, entry, record: entry, commandIndex: null };
}

/** Fall back to a full scan — the file may have changed since the last parse. */
function scanForHook(arr: RawHookEntry[], hook: Hook): Located | null {
  for (let i = 0; i < arr.length; i++) {
    const entry = arr[i];
    if (!entry || typeof entry !== "object") continue;
    const entryMatcher = typeof entry.matcher === "string" ? entry.matcher : "";
    if (entryMatcher !== hook.matcher) continue;

    if (Array.isArray(entry.hooks)) {
      for (let j = 0; j < entry.hooks.length; j++) {
        if (recordMatches(entry.hooks[j], hook)) {
          return { arr, entryIndex: i, entry, record: entry.hooks[j], commandIndex: j };
        }
      }
      continue;
    }

    if (recordMatches(entry, hook)) {
      return { arr, entryIndex: i, entry, record: entry, commandIndex: null };
    }
  }
  return null;
}

/**
 * Locate the JSON record backing a `Hook` snapshot. Index-first: the
 * webview's snapshot carries the entryIndex/commandIndex from the
 * last parse, which resolves duplicates (identical matcher+command
 * pairs) deterministically instead of always hitting the first match.
 * Falls back to a full scan when the index is stale (file edited
 * externally since the last parse) or absent.
 */
function locateHook(block: Record<string, RawHookEntry[]> | undefined, hook: Hook): Located | null {
  if (!block) return null;
  const arr = block[hook.event];
  if (!Array.isArray(arr)) return null;
  return tryLocateAt(arr, hook) ?? scanForHook(arr, hook);
}

/**
 * Remove a single hook record from its containing array. When the
 * record lived in a nested `hooks` array, only the inner element
 * goes; the outer entry stays if it still has siblings, otherwise
 * it is dropped too. Returns true if anything was removed.
 */
function removeAt(match: Located | null): boolean {
  if (!match) return false;
  if (match.commandIndex !== null) {
    const inner = match.entry.hooks;
    if (!Array.isArray(inner)) return false;
    inner.splice(match.commandIndex, 1);
    if (inner.length === 0) match.arr.splice(match.entryIndex, 1);
    return true;
  }
  match.arr.splice(match.entryIndex, 1);
  return true;
}

/**
 * Move a hook between the active (`hooks`) and parked
 * (`_disabled_hooks`) blocks. Returns true on success.
 */
export function toggleHookEnabled(
  filePath: string,
  hook: Hook,
  enable: boolean,
): boolean {
  // Plugin-sourced hooks live in plugin.json (owned by claude-code's
  // plugin install machinery) and have no settings.json to mutate.
  // Refusing here keeps the rest of the writer simple — it only ever
  // sees settings.json shapes.
  if (hook.scope === "plugin") return false;
  const data = readSettings(filePath);
  const sourceKey = enable ? "_disabled_hooks" : "hooks";
  const targetKey = enable ? "hooks" : "_disabled_hooks";
  const source = data[sourceKey] as Record<string, RawHookEntry[]> | undefined;
  const match = locateHook(source, hook);
  if (!match) return false;

  // Move payload: preserve everything, never rebuild. A nested entry
  // with siblings moves only the targeted sub-record — `{ ...entry,
  // hooks: [record] }` clones the outer entry's unknown keys (e.g.
  // `if`) into a NEW object with a NEW hooks array, so it shares no
  // mutable state with the source. A sole-child nested entry or a flat
  // entry moves verbatim (same object, since the whole thing leaves
  // the source anyway).
  const siblingCount = match.commandIndex !== null ? (match.entry.hooks?.length ?? 0) : 0;
  const hasSiblings = match.commandIndex !== null && siblingCount > 1;
  const movePayload: RawHookEntry = hasSiblings
    ? { ...match.entry, hooks: [match.record] }
    : match.entry;

  // Remove from the source. When only one command is leaving a
  // multi-command entry, splice its slot out of the (still-shared)
  // inner array — the entry itself stays. Otherwise the whole entry is
  // moving, so it comes out of the outer array directly; using the
  // shared removeAt() here would splice match.entry.hooks first, which
  // is the very array movePayload (== match.entry) is about to carry.
  if (hasSiblings) {
    match.entry.hooks!.splice(match.commandIndex as number, 1);
  } else {
    match.arr.splice(match.entryIndex, 1);
  }
  // Drop empty arrays to keep the file tidy.
  if (source && Array.isArray(source[hook.event]) && source[hook.event].length === 0) {
    delete source[hook.event];
  }
  if (source && Object.keys(source).length === 0) {
    delete data[sourceKey];
  }

  // Insert into target block.
  let target = data[targetKey] as Record<string, RawHookEntry[]> | undefined;
  if (!target) {
    target = {};
    data[targetKey] = target;
  }
  if (!Array.isArray(target[hook.event])) target[hook.event] = [];
  target[hook.event].push(movePayload);

  return writeSettings(filePath, data);
}

/** Permanently delete a hook entry. Returns true on success. */
export function deleteHook(filePath: string, hook: Hook): boolean {
  if (hook.scope === "plugin") return false;
  const data = readSettings(filePath);
  const blockKey = hook.disabled ? "_disabled_hooks" : "hooks";
  const block = data[blockKey] as Record<string, RawHookEntry[]> | undefined;
  const match = locateHook(block, hook);
  if (!removeAt(match)) return false;
  if (block && Array.isArray(block[hook.event]) && block[hook.event].length === 0) {
    delete block[hook.event];
  }
  if (block && Object.keys(block).length === 0) {
    delete data[blockKey];
  }
  return writeSettings(filePath, data);
}

/**
 * Rewrite an existing hook's matcher + command in place. Only
 * targeted fields are mutated — `timeout`, `type`, and any unknown
 * keys on the record survive untouched. Refuses non-"command" hooks:
 * a prompt/http/agent/mcp_tool record has no "command" field to
 * rewrite, so blindly writing one would corrupt it.
 */
export function updateHook(
  filePath: string,
  original: Hook,
  next: { matcher: string; command: string },
): boolean {
  if (original.scope === "plugin") return false;
  if (original.hookType !== "command") return false;
  const data = readSettings(filePath);
  const blockKey = original.disabled ? "_disabled_hooks" : "hooks";
  const block = data[blockKey] as Record<string, RawHookEntry[]> | undefined;
  const match = locateHook(block, original);
  if (!match) return false;

  match.entry.matcher = next.matcher;
  match.record.command = next.command;

  return writeSettings(filePath, data);
}

/**
 * Append a new hook to the active `hooks` block. Uses the nested
 * shape Claude CLI prefers in fresh writes: each entry has a
 * `matcher` plus a `hooks` array of `{ type: "command", command }`
 * records.
 */
export function addHook(
  filePath: string,
  event: string,
  matcher: string,
  command: string,
): boolean {
  if (!event.trim() || !command.trim()) return false;
  const data = readSettings(filePath);
  let block = data.hooks;
  if (!block) {
    block = {};
    data.hooks = block;
  }
  if (!Array.isArray(block[event])) block[event] = [];
  block[event].push({
    matcher,
    hooks: [{ type: "command", command }],
  });
  return writeSettings(filePath, data);
}
