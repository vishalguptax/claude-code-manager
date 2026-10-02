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
import {
  describeReadRefusal,
  readJsonObjectForWrite,
  writeFileAtomic,
  type WriteOutcome,
} from "../../core/atomicWrite";
import { hookRecordIdentity, hookRecordType, type HookRecord, type RawHookEntry } from "./hookRecord";
import type { Hook } from "./types";

interface SettingsShape {
  hooks?: Record<string, RawHookEntry[]>;
  _disabled_hooks?: Record<string, RawHookEntry[]>;
  [key: string]: unknown;
}

/**
 * Read a settings file for a read-modify-write pass, or the reason it must
 * not be rewritten — see readJsonObjectForWrite.
 *
 * Both looser answers lost data. Answering `{}` for an unparseable file
 * meant toggling one hook replaced a settings.json carrying a comment or
 * a trailing comma with nothing but that hook. Answering `{}` for a freshly
 * emptied file or a failed read did the same to a file Claude Code was
 * rewriting at that moment.
 */
function readSettings(filePath: string): { ok: true; data: SettingsShape } | { ok: false; error: string } {
  const read = readJsonObjectForWrite(filePath);
  return read.ok
    ? { ok: true, data: read.data as SettingsShape }
    : { ok: false, error: describeReadRefusal(filePath, read) };
}

function writeSettings(filePath: string, data: SettingsShape): WriteOutcome {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, JSON.stringify(data, null, 2) + "\n");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `${filePath} couldn't be written (${(err as Error).message})` };
  }
}

/** Plugin hooks live in plugin.json, owned by Claude Code's plugin installer. */
const PLUGIN_HOOK: WriteOutcome = {
  ok: false,
  error: "Plugin hooks are managed by their plugin and can't be changed here",
};

/** The hook is not where the last parse saw it. */
function hookNotFound(filePath: string): WriteOutcome {
  return { ok: false, error: `The hook is no longer in ${filePath} — it may have been edited on disk` };
}

/** Only command hooks carry the fields an edit changes. */
const NOT_EDITABLE: WriteOutcome = {
  ok: false,
  error: "Only command hooks can be edited; other hook types support toggle and delete",
};

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
 * (`_disabled_hooks`) blocks.
 */
export function toggleHookEnabled(
  filePath: string,
  hook: Hook,
  enable: boolean,
): WriteOutcome {
  // Plugin-sourced hooks live in plugin.json (owned by claude-code's
  // plugin install machinery) and have no settings.json to mutate.
  // Refusing here keeps the rest of the writer simple — it only ever
  // sees settings.json shapes.
  if (hook.scope === "plugin") return PLUGIN_HOOK;
  const read = readSettings(filePath);
  // Refuse rather than replace a settings file we cannot parse.
  if (!read.ok) return read;
  const data = read.data;
  const sourceKey = enable ? "_disabled_hooks" : "hooks";
  const targetKey = enable ? "hooks" : "_disabled_hooks";
  const source = data[sourceKey] as Record<string, RawHookEntry[]> | undefined;
  const match = locateHook(source, hook);
  if (!match) return hookNotFound(filePath);

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

/** Permanently delete a hook entry. */
export function deleteHook(filePath: string, hook: Hook): WriteOutcome {
  if (hook.scope === "plugin") return PLUGIN_HOOK;
  const read = readSettings(filePath);
  // Refuse rather than replace a settings file we cannot parse.
  if (!read.ok) return read;
  const data = read.data;
  const blockKey = hook.disabled ? "_disabled_hooks" : "hooks";
  const block = data[blockKey] as Record<string, RawHookEntry[]> | undefined;
  const match = locateHook(block, hook);
  if (!removeAt(match)) return hookNotFound(filePath);
  if (block && Array.isArray(block[hook.event]) && block[hook.event].length === 0) {
    delete block[hook.event];
  }
  if (block && Object.keys(block).length === 0) {
    delete data[blockKey];
  }
  return writeSettings(filePath, data);
}

/** Fields an edit can change on a command hook. */
export interface HookEdit {
  matcher: string;
  command: string;
  /** New event name; omit/equal to keep the hook under its current event. */
  event?: string;
  /** Timeout in seconds; `undefined` removes the field. */
  timeout?: number;
}

/** Set or remove the numeric `timeout` on a record per the edit. */
function applyTimeout(record: HookRecord, timeout: number | undefined): void {
  if (timeout === undefined) delete record.timeout;
  else record.timeout = timeout;
}

/**
 * The edited copy of a located record, for re-homing it under another
 * event or into another file. It starts from the whole original object —
 * rebuilding `{ type, command, timeout }` dropped `if`, `async`,
 * `statusMessage` and every key we don't know — and overrides only the
 * edited fields. A flat entry is its own record, so its `matcher` (a group
 * key) stays behind, and it gets the `type` the nested shape requires.
 */
function editedRecord(match: Located, next: HookEdit): HookRecord {
  const record: HookRecord = { type: "command", ...match.record };
  if (match.commandIndex === null) delete record.matcher;
  record.command = next.command;
  applyTimeout(record, next.timeout);
  return record;
}

/**
 * Give one located record a new matcher within its event. The matcher is
 * a property of the whole group entry, so setting it there re-matched
 * every sibling command too. The record moves instead: into a group that
 * already uses the new matcher, else into a new group cloned from its old
 * one (keeping group-level keys) right after it. The old group is dropped
 * only once empty. A flat entry, or a group with no siblings and no
 * existing target, is re-matched in place.
 */
function rematchRecord(match: Located, matcher: string): void {
  const { arr, entry, entryIndex, commandIndex, record } = match;
  const inner = entry.hooks;
  if (commandIndex === null || !Array.isArray(inner)) {
    entry.matcher = matcher;
    return;
  }
  const target = arr.find(
    (e) =>
      e !== entry &&
      e &&
      typeof e === "object" &&
      Array.isArray(e.hooks) &&
      (typeof e.matcher === "string" ? e.matcher : "") === matcher,
  );
  if (target) {
    target.hooks!.push(record);
  } else if (inner.length === 1) {
    entry.matcher = matcher;
    return;
  } else {
    arr.splice(entryIndex + 1, 0, { ...entry, matcher, hooks: [record] });
  }
  inner.splice(commandIndex, 1);
  if (inner.length === 0) arr.splice(entryIndex, 1);
}

/** Append a `{ matcher, hooks: [record] }` entry under an event block. */
function insertHookEntry(
  data: SettingsShape,
  blockKey: "hooks" | "_disabled_hooks",
  event: string,
  matcher: string,
  record: HookRecord,
): void {
  let block = data[blockKey] as Record<string, RawHookEntry[]> | undefined;
  if (!block) {
    block = {};
    data[blockKey] = block;
  }
  if (!Array.isArray(block[event])) block[event] = [];
  block[event].push({ matcher, hooks: [record] });
}

/** Drop an event array once empty, then the whole block if it emptied out. */
function dropEmpty(
  data: SettingsShape,
  blockKey: "hooks" | "_disabled_hooks",
  block: Record<string, RawHookEntry[]>,
  event: string,
): void {
  if (Array.isArray(block[event]) && block[event].length === 0) delete block[event];
  if (Object.keys(block).length === 0) delete data[blockKey];
}

/**
 * Rewrite an existing command hook within its own settings file.
 *
 * A same-event edit mutates command/timeout IN PLACE, so the record's
 * `type`, `if`, and any unknown keys survive untouched (lossless); a
 * matcher change moves just this record between groups (see
 * rematchRecord). Changing the event is a re-home: the record is removed
 * from the old event array and inserted, edited but otherwise whole, as
 * a nested `{ matcher, hooks: [record] }` entry under the new event.
 *
 * Cross-scope moves go through {@link moveHookToFile} (two files).
 * Refuses plugin + non-command hooks.
 */
export function updateHook(filePath: string, original: Hook, next: HookEdit): WriteOutcome {
  if (original.scope === "plugin") return PLUGIN_HOOK;
  if (original.hookType !== "command") return NOT_EDITABLE;
  const read = readSettings(filePath);
  // Refuse rather than replace a settings file we cannot parse.
  if (!read.ok) return read;
  const data = read.data;
  const blockKey = original.disabled ? "_disabled_hooks" : "hooks";
  const block = data[blockKey] as Record<string, RawHookEntry[]> | undefined;
  const match = locateHook(block, original);
  if (!match || !block) return hookNotFound(filePath);

  const targetEvent = next.event ?? original.event;

  if (targetEvent === original.event) {
    match.record.command = next.command;
    applyTimeout(match.record, next.timeout);
    if (next.matcher !== original.matcher) rematchRecord(match, next.matcher);
    return writeSettings(filePath, data);
  }

  // Event change — re-home the record under the new event.
  const record = editedRecord(match, next);
  removeAt(match);
  dropEmpty(data, blockKey, block, original.event);
  insertHookEntry(data, blockKey, targetEvent, next.matcher, record);
  return writeSettings(filePath, data);
}

/**
 * Move a command hook to a different scope's settings file (and
 * optionally a different event). Writes the destination FIRST, then
 * removes from the source, so a partial failure duplicates (recoverable)
 * rather than loses the hook. Preserves the disabled/parked state.
 * Refuses plugin + non-command hooks.
 */
export function moveHookToFile(
  fromFile: string,
  toFile: string,
  original: Hook,
  next: HookEdit,
): WriteOutcome {
  if (original.scope === "plugin") return PLUGIN_HOOK;
  if (original.hookType !== "command") return NOT_EDITABLE;

  const fromRead = readSettings(fromFile);
  // Refuse rather than replace a settings file we cannot parse.
  if (!fromRead.ok) return fromRead;
  const fromData = fromRead.data;
  const blockKey = original.disabled ? "_disabled_hooks" : "hooks";
  const fromBlock = fromData[blockKey] as Record<string, RawHookEntry[]> | undefined;
  const match = locateHook(fromBlock, original);
  if (!match || !fromBlock) return hookNotFound(fromFile);

  // Insert into the destination file first.
  const toRead = readSettings(toFile);
  // Refuse rather than replace a settings file we cannot parse.
  if (!toRead.ok) return toRead;
  const toData = toRead.data;
  insertHookEntry(toData, blockKey, next.event ?? original.event, next.matcher, editedRecord(match, next));
  const wroteTo = writeSettings(toFile, toData);
  if (!wroteTo.ok) return wroteTo;

  // Then remove from the source.
  removeAt(match);
  dropEmpty(fromData, blockKey, fromBlock, original.event);
  return writeSettings(fromFile, fromData);
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
): WriteOutcome {
  if (!event.trim() || !command.trim()) {
    return { ok: false, error: "A hook needs both an event and a command" };
  }
  const read = readSettings(filePath);
  // Refuse rather than replace a settings file we cannot parse.
  if (!read.ok) return read;
  const data = read.data;
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
