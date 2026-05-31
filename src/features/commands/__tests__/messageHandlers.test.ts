import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";

const { HOME } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { HOME: _path.join(_os.tmpdir(), ".claude-test-cmd-handlers") };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import type { Message } from "../../../shared/protocol/messages";
import {
  type CommandsHost,
  dispatchCommandsMessage,
  handlesCommandsMessage,
} from "../messageHandlers";

interface Calls {
  posted: Message[];
  openedFiles: string[];
  openedUrls: string[];
  launched: string[];
}

function makeHost(): { host: CommandsHost; calls: Calls } {
  const calls: Calls = { posted: [], openedFiles: [], openedUrls: [], launched: [] };
  const host: CommandsHost = {
    post: (m) => calls.posted.push(m),
    openFile: (p) => {
      calls.openedFiles.push(p);
    },
    openUrl: (u) => {
      calls.openedUrls.push(u);
    },
    launchChat: (p) => {
      calls.launched.push(p);
    },
  };
  return { host, calls };
}

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("handlesCommandsMessage", () => {
  it("recognises the feature's inbound message types", () => {
    expect(handlesCommandsMessage("getCommands")).toBe(true);
    expect(handlesCommandsMessage("openCommandFile")).toBe(true);
    expect(handlesCommandsMessage("openUrl")).toBe(true);
    expect(handlesCommandsMessage("launchChatWithPrompt")).toBe(true);
    expect(handlesCommandsMessage("getSkills")).toBe(false);
  });
});

describe("dispatchCommandsMessage", () => {
  it("rejects malformed input without throwing and without side effects", async () => {
    const { host, calls } = makeHost();
    const handled = await dispatchCommandsMessage({ nope: true }, host);
    expect(handled).toBe(false);
    expect(calls.posted).toHaveLength(0);
    expect(calls.openedFiles).toHaveLength(0);
  });

  it("rejects a message missing required fields (openCommandFile without path)", async () => {
    const { host, calls } = makeHost();
    const handled = await dispatchCommandsMessage({ type: "openCommandFile" }, host);
    expect(handled).toBe(false);
    expect(calls.openedFiles).toHaveLength(0);
  });

  it("returns false for a valid message belonging to another feature", async () => {
    const { host, calls } = makeHost();
    const handled = await dispatchCommandsMessage({ type: "getSkills" }, host);
    expect(handled).toBe(false);
    expect(calls.posted).toHaveLength(0);
  });

  it("responds to getCommands with the parsed command catalog", async () => {
    const { host, calls } = makeHost();
    const handled = await dispatchCommandsMessage({ type: "getCommands" }, host);
    expect(handled).toBe(true);
    expect(calls.posted).toHaveLength(1);
    const msg = calls.posted[0];
    expect(msg?.type).toBe("commands");
    if (msg?.type === "commands") {
      expect(Array.isArray(msg.data)).toBe(true);
      expect((msg.data as unknown[]).length).toBeGreaterThan(40);
    }
  });

  it("opens a command file", async () => {
    const { host, calls } = makeHost();
    await dispatchCommandsMessage({ type: "openCommandFile", path: "/x/review.md" }, host);
    expect(calls.openedFiles).toEqual(["/x/review.md"]);
  });

  it("opens a URL", async () => {
    const { host, calls } = makeHost();
    await dispatchCommandsMessage({ type: "openUrl", url: "https://docs" }, host);
    expect(calls.openedUrls).toEqual(["https://docs"]);
  });

  it("launches chat with the supplied prompt", async () => {
    const { host, calls } = makeHost();
    await dispatchCommandsMessage({ type: "launchChatWithPrompt", prompt: "/review" }, host);
    expect(calls.launched).toEqual(["/review"]);
  });

  it("posts an error message when parseCommands throws", async () => {
    const { host, calls } = makeHost();
    const parser = await import("../parser");
    const spy = vi.spyOn(parser, "parseCommands").mockImplementation(() => {
      throw new Error("disk on fire");
    });
    const handled = await dispatchCommandsMessage({ type: "getCommands" }, host);
    expect(handled).toBe(true);
    expect(calls.posted[0]?.type).toBe("error");
    spy.mockRestore();
  });
});
