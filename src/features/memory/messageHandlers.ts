/**
 * Host-side message dispatch for the Memory browser.
 *
 * Mirrors `features/mcp/messageHandlers.ts`: the handler depends only on a
 * narrow {@link MemoryHostContext} so it never reaches into another feature's
 * provider, and it returns `true` for every message it owns — handled or
 * rejected — so the caller's ordered fall-through short-circuits.
 *
 * One deliberate difference from MCP and checkpoints: those validate with the
 * shared valibot parser, which only knows message types declared in
 * `src/shared/protocol/schemas.ts`. Memory's types are not there yet, so
 * {@link parseMemoryMessage} does the narrowing. It is a dozen lines of shape
 * checks, it is directly unit-testable, and it keeps the feature from
 * trusting an unvalidated `unknown` in the meantime.
 */
import * as vscode from "vscode";
import { deleteMemory, openMemory, revealMemory } from "./commands";
import { loadMemoryStore } from "./parser";
import type { MemoryRequest, MemoryResponse } from "./types";

/** Narrow host surface the memory handler needs. */
export interface MemoryHostContext {
  /** The live webview, or undefined when the view is not resolved. */
  getWebview(): vscode.Webview | undefined;
}

/** Message types this feature owns. */
export const MEMORY_TYPES: ReadonlySet<string> = new Set([
  "getMemories",
  "openMemory",
  "revealMemory",
  "deleteMemory",
]);

/** True when `value` is a non-empty string — the shape every id field takes. */
function isId(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * Narrow an arbitrary inbound value to a memory request.
 *
 * Returns `null` both for "not ours" and for "ours but malformed"; the caller
 * distinguishes them with {@link MEMORY_TYPES}, because a malformed message of
 * ours must be rejected rather than passed down the chain to a handler that
 * would also not understand it.
 */
export function parseMemoryMessage(raw: unknown): MemoryRequest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const msg = raw as Record<string, unknown>;
  if (msg.type === "getMemories") return { type: "getMemories" };
  if (
    (msg.type === "openMemory" ||
      msg.type === "revealMemory" ||
      msg.type === "deleteMemory") &&
    isId(msg.project) &&
    isId(msg.fileName)
  ) {
    return { type: msg.type, project: msg.project, fileName: msg.fileName };
  }
  return null;
}

/** Re-read the store and push it to the webview. */
function pushStore(wv: vscode.Webview): void {
  const message: MemoryResponse = { type: "memoryStore", data: loadMemoryStore() };
  wv.postMessage(message);
}

/**
 * Validate and handle one memory webview→host message.
 *
 * @returns `true` if the message was a memory message (handled or rejected),
 *   `false` if the caller should try other handlers.
 */
export async function handleMemoryMessage(
  raw: unknown,
  ctx: MemoryHostContext,
): Promise<boolean> {
  const msg = parseMemoryMessage(raw);
  if (msg === null) {
    const type = (raw as { type?: unknown } | null)?.type;
    if (typeof type === "string" && MEMORY_TYPES.has(type)) {
      console.error("[claude-manager] rejected malformed memory message", type);
      return true;
    }
    return false;
  }

  const wv = ctx.getWebview();

  switch (msg.type) {
    case "getMemories": {
      if (wv) pushStore(wv);
      return true;
    }

    case "openMemory": {
      await openMemory(msg.project, msg.fileName);
      return true;
    }

    case "revealMemory": {
      await revealMemory(msg.project, msg.fileName);
      return true;
    }

    case "deleteMemory": {
      const result = await deleteMemory(msg.project, msg.fileName);
      // Only a real deletion changes the store. Re-pushing after a declined
      // confirmation would churn the list — and, worse, make a cancel look
      // like it did something.
      if (result.ok && wv) pushStore(wv);
      return true;
    }
  }
}
