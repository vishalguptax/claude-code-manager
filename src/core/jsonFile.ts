/**
 * Read-only JSON object reads from trees the extension does not own
 * (settings files, plugin registries, policy files). Every read refuses
 * symlinks via `openFileNoFollow`.
 *
 * Writers use `readJsonObjectForWrite` in atomicWrite.ts instead: it must
 * refuse a mid-write file, which a reader can simply treat as absent.
 *
 * Pure Node.js — no VS Code dependency.
 */
import * as fs from "fs";
import { openFileNoFollow } from "./safeOpen";

/**
 * Files are read whole into memory. A settings or registry file past this is
 * not one, and refusing beats allocating on a filename.
 */
const MAX_JSON_BYTES = 8 * 1024 * 1024;

/** A plain JSON object, or null for anything else. */
export function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Outcome of reading one JSON file: the object, or why there isn't one. */
export type JsonRead =
  | { kind: "ok"; data: Record<string, unknown> }
  | { kind: "absent" }
  | { kind: "invalid"; reason: string };

/**
 * Read one JSON object from disk, refusing symlinks.
 *
 * `absent` and `invalid` are kept apart on purpose. A missing settings file
 * is the normal case and must stay silent; a file that exists but does not
 * parse is a user-visible problem — Claude Code skips such a file wholesale,
 * so everything the user configured in it is inert.
 */
export function readJsonObject(filePath: string): JsonRead {
  const fd = openFileNoFollow(filePath);
  if (fd === null) {
    // openFileNoFollow collapses missing / symlink / permission into null.
    // Distinguish "not there" (silent) from "there but unreadable" (report).
    try {
      fs.lstatSync(filePath);
    } catch {
      return { kind: "absent" };
    }
    return { kind: "invalid", reason: "not a regular file, or unreadable" };
  }
  try {
    const { size } = fs.fstatSync(fd);
    if (size === 0) return { kind: "absent" };
    if (size > MAX_JSON_BYTES) {
      return { kind: "invalid", reason: `larger than ${MAX_JSON_BYTES} bytes` };
    }
    const buf = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const read = fs.readSync(fd, buf, offset, size - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    const text = buf.subarray(0, offset).toString("utf-8");
    if (text.trim() === "") return { kind: "absent" };
    const parsed = asObject(JSON.parse(text));
    if (parsed === null) return { kind: "invalid", reason: "not a JSON object" };
    return { kind: "ok", data: parsed };
  } catch (err) {
    return { kind: "invalid", reason: (err as Error).message };
  } finally {
    fs.closeSync(fd);
  }
}
