import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

// The handler reads the real history path through the parser, so point
// HISTORY_FILE at a temp file this suite owns.
const { HISTORY_FILE, ROOT } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-prompts-handlers");
  return { ROOT: root, HISTORY_FILE: _path.join(root, "history.jsonl") };
});

vi.mock("../../../core/config", () => ({ HISTORY_FILE }));

import { handlePromptsMessage, parsePromptsMessage } from "../messageHandlers";
import { clearPromptHistoryCache } from "../parser";
import type { PromptsHostContext } from "../messageHandlers";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";

let posted: unknown[];
let resumed: string[];
let webview: { postMessage: (m: unknown) => void } | undefined;

function ctx(): PromptsHostContext {
  return {
    getWebview: () => webview as never,
    resumeSession: async (id) => {
      resumed.push(id);
    },
  };
}

function writeHistory(...lines: Record<string, unknown>[]): void {
  fs.writeFileSync(HISTORY_FILE, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

beforeEach(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  clearPromptHistoryCache();
  posted = [];
  resumed = [];
  webview = { postMessage: (m) => posted.push(m) };
  vi.spyOn(vscode.env.clipboard, "writeText").mockImplementation(async () => {});
  vi.spyOn(vscode.window, "showInformationMessage").mockImplementation(vi.fn());
  vi.spyOn(vscode.window, "showErrorMessage").mockImplementation(vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("parsePromptsMessage", () => {
  it("accepts every type this feature owns", () => {
    expect(parsePromptsMessage({ type: "getPromptHistory" })).toEqual({
      type: "getPromptHistory",
    });
    expect(parsePromptsMessage({ type: "copyPrompt", text: "hi" })).toEqual({
      type: "copyPrompt",
      text: "hi",
    });
    expect(parsePromptsMessage({ type: "openPromptSession", sessionId: SESSION })).toEqual({
      type: "openPromptSession",
      sessionId: SESSION,
    });
  });

  it("rejects a known type carrying the wrong field type", () => {
    expect(parsePromptsMessage({ type: "copyPrompt", text: 42 })).toBeNull();
    expect(parsePromptsMessage({ type: "copyPrompt" })).toBeNull();
    expect(parsePromptsMessage({ type: "openPromptSession", sessionId: null })).toBeNull();
  });

  it("rejects anything that is not one of ours", () => {
    expect(parsePromptsMessage({ type: "getMcpServers" })).toBeNull();
    expect(parsePromptsMessage(null)).toBeNull();
    expect(parsePromptsMessage("getPromptHistory")).toBeNull();
    expect(parsePromptsMessage(undefined)).toBeNull();
  });

  it("does not claim the config feature's prompt* dialogs", () => {
    // The message-bus prefix problem in reverse: these look like ours by name
    // and are not.
    expect(parsePromptsMessage({ type: "promptAddHook" })).toBeNull();
    expect(parsePromptsMessage({ type: "promptCustomModel" })).toBeNull();
  });
});

describe("handlePromptsMessage", () => {
  it("defers a message it does not own", async () => {
    expect(await handlePromptsMessage({ type: "getMcpServers" }, ctx())).toBe(false);
    expect(posted).toEqual([]);
  });

  it("claims and rejects a malformed message of its own type", async () => {
    expect(await handlePromptsMessage({ type: "copyPrompt", text: 42 }, ctx())).toBe(true);
    expect(posted).toEqual([]);
  });

  it("posts the prompt history newest first", async () => {
    writeHistory(
      { display: "older", timestamp: 100, project: "/w/app", sessionId: SESSION, pastedContents: {} },
      { display: "newer", timestamp: 200, project: "/w/app", sessionId: SESSION, pastedContents: {} },
    );
    expect(await handlePromptsMessage({ type: "getPromptHistory" }, ctx())).toBe(true);
    expect(posted).toHaveLength(1);
    const msg = posted[0] as { type: string; data: { text: string }[] };
    expect(msg.type).toBe("promptHistory");
    expect(msg.data.map((e) => e.text)).toEqual(["newer", "older"]);
  });

  it("posts an empty list when the history file does not exist", async () => {
    await handlePromptsMessage({ type: "getPromptHistory" }, ctx());
    expect(posted).toEqual([{ type: "promptHistory", data: [] }]);
  });

  it("claims getPromptHistory even with no webview, without posting", async () => {
    webview = undefined;
    expect(await handlePromptsMessage({ type: "getPromptHistory" }, ctx())).toBe(true);
    expect(posted).toEqual([]);
  });

  it("copies a prompt to the clipboard", async () => {
    expect(await handlePromptsMessage({ type: "copyPrompt", text: "hello" }, ctx())).toBe(true);
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith("hello");
  });

  it("routes openPromptSession to the host's resume path", async () => {
    expect(
      await handlePromptsMessage({ type: "openPromptSession", sessionId: SESSION }, ctx()),
    ).toBe(true);
    expect(resumed).toEqual([SESSION]);
  });

  it("does not resume for a prompt with no session id", async () => {
    await handlePromptsMessage({ type: "openPromptSession", sessionId: "" }, ctx());
    expect(resumed).toEqual([]);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it("serves a second history request from the mtime cache", async () => {
    writeHistory({ display: "one", timestamp: 1, project: "/w/app", sessionId: SESSION, pastedContents: {} });
    await handlePromptsMessage({ type: "getPromptHistory" }, ctx());
    await handlePromptsMessage({ type: "getPromptHistory" }, ctx());
    const first = (posted[0] as { data: unknown }).data;
    const second = (posted[1] as { data: unknown }).data;
    // Same array identity across two requests — the file was read once.
    expect(second).toBe(first);
  });

  it("re-reads after the file grows", async () => {
    writeHistory({ display: "one", timestamp: 1, project: "/w/app", sessionId: SESSION, pastedContents: {} });
    await handlePromptsMessage({ type: "getPromptHistory" }, ctx());
    writeHistory(
      { display: "one", timestamp: 1, project: "/w/app", sessionId: SESSION, pastedContents: {} },
      { display: "two", timestamp: 2, project: "/w/app", sessionId: SESSION, pastedContents: {} },
    );
    await handlePromptsMessage({ type: "getPromptHistory" }, ctx());
    const second = (posted[1] as { data: { text: string }[] }).data;
    expect(second.map((e) => e.text)).toEqual(["two", "one"]);
  });

  it("never leaks pastedContents into the posted payload", async () => {
    writeHistory({
      display: "explain this",
      timestamp: 1,
      project: "/w/app",
      sessionId: SESSION,
      pastedContents: { "1": { id: 1, type: "text", content: "y".repeat(50_000) } },
    });
    await handlePromptsMessage({ type: "getPromptHistory" }, ctx());
    const json = JSON.stringify(posted[0]);
    expect(json).not.toContain("pastedContents");
    expect(json).not.toContain("yyyy");
    expect(json.length).toBeLessThan(1_000);
  });
});

// Keeps the unused import honest: the suite asserts against the mocked
// HISTORY_FILE path rather than the user's real one.
describe("test isolation", () => {
  it("points at a temp history file, never the user's", () => {
    expect(HISTORY_FILE.startsWith(os.tmpdir())).toBe(true);
    expect(path.basename(HISTORY_FILE)).toBe("history.jsonl");
  });
});
