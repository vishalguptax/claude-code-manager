/**
 * Tests for the memory host dispatch.
 *
 * Two contracts: the handler claims exactly its own message types (so the
 * provider's ordered fall-through neither swallows another feature's message
 * nor leaks a malformed one of ours), and it re-pushes the store only when a
 * delete actually happened.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { PROJECTS_DIR, SETTINGS_FILE, ROOT } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-memory-messages");
  return {
    ROOT: root,
    PROJECTS_DIR: _path.join(root, "projects"),
    SETTINGS_FILE: _path.join(root, "settings.json"),
  };
});

vi.mock("../../../core/config", () => ({ PROJECTS_DIR, SETTINGS_FILE }));

const commands = vi.hoisted(() => ({
  deleteMemory: vi.fn(),
  openMemory: vi.fn(),
  revealMemory: vi.fn(),
}));
vi.mock("../commands", () => commands);

import { handleMemoryMessage, parseMemoryMessage } from "../messageHandlers";
import type { MemoryStore } from "../types";

const PROJECT = "-Users-me-code-demo";
const MEM_DIR = path.join(PROJECTS_DIR, PROJECT, "memory");

/** The webview stub, capturing everything the handler posts. */
function makeContext(): {
  ctx: { getWebview: () => { postMessage: (m: unknown) => void } | undefined };
  posted: unknown[];
} {
  const posted: unknown[] = [];
  return {
    posted,
    ctx: { getWebview: () => ({ postMessage: (m: unknown) => posted.push(m) }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  commands.deleteMemory.mockResolvedValue({ ok: true });
  commands.openMemory.mockResolvedValue(true);
  commands.revealMemory.mockResolvedValue(true);
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(MEM_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(MEM_DIR, "a.md"),
    "---\nname: a\ndescription: d\nmetadata: \n  type: feedback\n---\nBody.\n",
  );
});

describe("parseMemoryMessage", () => {
  it("accepts the four owned shapes", () => {
    expect(parseMemoryMessage({ type: "getMemories" })).toEqual({ type: "getMemories" });
    for (const type of ["openMemory", "revealMemory", "deleteMemory"]) {
      expect(parseMemoryMessage({ type, project: "p", fileName: "f.md" })).toEqual({
        type,
        project: "p",
        fileName: "f.md",
      });
    }
  });

  it("rejects a missing or non-string field", () => {
    expect(parseMemoryMessage({ type: "openMemory", project: "p" })).toBeNull();
    expect(parseMemoryMessage({ type: "openMemory", project: 1, fileName: "f.md" })).toBeNull();
    expect(parseMemoryMessage({ type: "openMemory", project: "", fileName: "f.md" })).toBeNull();
  });

  it("rejects non-objects and other features' messages", () => {
    expect(parseMemoryMessage(null)).toBeNull();
    expect(parseMemoryMessage("getMemories")).toBeNull();
    expect(parseMemoryMessage({ type: "getMcpServers" })).toBeNull();
  });
});

describe("handleMemoryMessage", () => {
  it("defers a message it does not own", async () => {
    const { ctx, posted } = makeContext();
    expect(await handleMemoryMessage({ type: "getMcpServers" }, ctx)).toBe(false);
    expect(posted).toEqual([]);
  });

  it("claims and rejects a malformed message of its own type", async () => {
    const { ctx, posted } = makeContext();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await handleMemoryMessage({ type: "deleteMemory" }, ctx)).toBe(true);
    expect(commands.deleteMemory).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
    expect(log).toHaveBeenCalled();
  });

  it("pushes the store for getMemories", async () => {
    const { ctx, posted } = makeContext();
    expect(await handleMemoryMessage({ type: "getMemories" }, ctx)).toBe(true);
    expect(posted).toHaveLength(1);
    const msg = posted[0] as { type: string; data: MemoryStore };
    expect(msg.type).toBe("memoryStore");
    expect(msg.data.projects[0].memories[0].meta.name).toBe("a");
  });

  it("survives a getMemories with no resolved webview", async () => {
    const ctx = { getWebview: () => undefined };
    expect(await handleMemoryMessage({ type: "getMemories" }, ctx)).toBe(true);
  });

  it("delegates open and reveal without re-pushing the store", async () => {
    const { ctx, posted } = makeContext();
    await handleMemoryMessage({ type: "openMemory", project: PROJECT, fileName: "a.md" }, ctx);
    await handleMemoryMessage({ type: "revealMemory", project: PROJECT, fileName: "a.md" }, ctx);
    expect(commands.openMemory).toHaveBeenCalledWith(PROJECT, "a.md");
    expect(commands.revealMemory).toHaveBeenCalledWith(PROJECT, "a.md");
    expect(posted).toEqual([]);
  });

  it("re-pushes the store after a delete that happened", async () => {
    const { ctx, posted } = makeContext();
    await handleMemoryMessage({ type: "deleteMemory", project: PROJECT, fileName: "a.md" }, ctx);
    expect(commands.deleteMemory).toHaveBeenCalledWith(PROJECT, "a.md");
    expect((posted[0] as { type: string }).type).toBe("memoryStore");
  });

  it("does not re-push after a declined delete", async () => {
    commands.deleteMemory.mockResolvedValue({ ok: false, reason: "cancelled" });
    const { ctx, posted } = makeContext();
    await handleMemoryMessage({ type: "deleteMemory", project: PROJECT, fileName: "a.md" }, ctx);
    expect(posted).toEqual([]);
  });
});
