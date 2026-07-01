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
import type { Hook, HookScope } from "./types";

interface RawHookEntry {
  matcher?: string;
  command?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

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

/**
 * Iterate every entry in a hooks-style block and yield enough
 * context for callers to mutate or remove the matched record.
 * Handles both the flat (`{ matcher, command }`) and nested
 * (`{ matcher, hooks: [{ command }] }`) formats Claude accepts.
 */
function findEntry(
  block: Record<string, RawHookEntry[]> | undefined,
  event: string,
  matcher: string,
  command: string,
):
  | {
      arr: RawHookEntry[];
      index: number;
      entry: RawHookEntry;
      nestedIndex: number | null;
    }
  | null {
  if (!block) return null;
  const arr = block[event];
  if (!Array.isArray(arr)) return null;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e || typeof e !== "object") continue;
    const entryMatcher = typeof e.matcher === "string" ? e.matcher : "";
    if (entryMatcher !== matcher) continue;

    if (Array.isArray(e.hooks)) {
      for (let j = 0; j < e.hooks.length; j++) {
        const sub = e.hooks[j];
        if (sub && typeof sub === "object" && sub.command === command) {
          return { arr, index: i, entry: e, nestedIndex: j };
        }
      }
      continue;
    }

    if (e.command === command) {
      return { arr, index: i, entry: e, nestedIndex: null };
    }
  }
  return null;
}

/**
 * Remove a single hook record from its containing array. When the
 * record lived in a nested `hooks` array, only the inner element
 * goes; the outer entry stays if it still has siblings, otherwise
 * it is dropped too. Returns true if anything was removed.
 */
function removeAt(
  match: ReturnType<typeof findEntry>,
): boolean {
  if (!match) return false;
  if (match.nestedIndex !== null) {
    const inner = match.entry.hooks;
    if (!Array.isArray(inner)) return false;
    inner.splice(match.nestedIndex, 1);
    if (inner.length === 0) match.arr.splice(match.index, 1);
    return true;
  }
  match.arr.splice(match.index, 1);
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
  const match = findEntry(source, hook.event, hook.matcher, hook.command);
  if (!match) return false;

  // Capture a clone of just the bit we want to move so the source
  // splice does not affect the value we later reinsert.
  let movePayload: RawHookEntry;
  if (match.nestedIndex !== null) {
    const inner = match.entry.hooks ?? [];
    const sub = inner[match.nestedIndex];
    movePayload = {
      matcher: hook.matcher,
      hooks: [sub],
    };
  } else {
    movePayload = match.entry;
  }

  removeAt(match);
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
  const match = findEntry(block, hook.event, hook.matcher, hook.command);
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
 * Rewrite an existing hook's matcher + command in place. Stays
 * inside whichever block (`hooks` / `_disabled_hooks`) the
 * original lived in.
 */
export function updateHook(
  filePath: string,
  original: Hook,
  next: { matcher: string; command: string },
): boolean {
  if (original.scope === "plugin") return false;
  const data = readSettings(filePath);
  const blockKey = original.disabled ? "_disabled_hooks" : "hooks";
  const block = data[blockKey] as Record<string, RawHookEntry[]> | undefined;
  const match = findEntry(block, original.event, original.matcher, original.command);
  if (!match) return false;

  if (match.nestedIndex !== null) {
    const inner = match.entry.hooks;
    if (!Array.isArray(inner)) return false;
    match.entry.matcher = next.matcher;
    inner[match.nestedIndex] = { type: "command", command: next.command };
  } else {
    match.entry.matcher = next.matcher;
    match.entry.command = next.command;
  }

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
  _scope: HookScope,
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
