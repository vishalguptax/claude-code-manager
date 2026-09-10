/**
 * Dispatch tests for the sessions webview → host messages.
 *
 * Scoped to `resumeMultiple` (the Restore action), which owns the only
 * non-trivial branching in the sessions dispatch: live sessions are focused
 * rather than resumed a second time, an empty group is explained instead of
 * silently ignored, and a large group is confirmed before it rearranges the
 * editor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { Session } from "../types";
import type { HostContext } from "../hostContext";

const resumeSession = vi.fn<
  (id: string, fork: boolean, sessions: Session[], forceTerminal?: boolean) => Promise<void>
>();

vi.mock("../commands", async () => {
  const actual = await vi.importActual<typeof import("../commands")>("../commands");
  return {
    ...actual,
    resumeSession: (id: string, fork: boolean, sessions: Session[], forceTerminal?: boolean) =>
      resumeSession(id, fork, sessions, forceTerminal),
  };
});

import { dispatch } from "../messageHandlers";

function session(over: Partial<Session> & { id: string }): Session {
  return {
    id: over.id,
    name: "",
    project: "proj",
    projectPath: "/repo/proj",
    branch: "main",
    entrypoint: "cli",
    startTime: 1000,
    endTime: 1000,
    messageCount: 1,
    summary: "summary",
    prompts: [],
    projectKey: "proj",
    searchHaystack: "",
    ...over,
  };
}

interface Harness {
  ctx: HostContext;
  viewed: string[];
  posted: unknown[];
}

function harness(sessions: Session[], tracked: string[] = []): Harness {
  const viewed: string[] = [];
  const posted: unknown[] = [];
  const trackedSet = new Set(tracked);
  const ctx = {
    terminals: {
      register: () => {},
      has: (id: string) => trackedSet.has(id),
      view: (id: string) => {
        viewed.push(id);
        return trackedSet.has(id);
      },
      ids: () => [...trackedSet],
      dispose: () => {},
    },
    getWebview: () =>
      ({ postMessage: (m: unknown) => posted.push(m) }) as unknown as vscode.Webview,
    getSessions: () => sessions,
  } as unknown as HostContext;
  return { ctx, viewed, posted };
}

beforeEach(() => {
  resumeSession.mockReset();
  resumeSession.mockResolvedValue(undefined);
  vi.restoreAllMocks();
});

describe("dispatch — resumeMultiple", () => {
  it("resumes every id in order, forcing the terminal path", async () => {
    const sessions = [session({ id: "a" }), session({ id: "b" }), session({ id: "c" })];
    const { ctx } = harness(sessions);

    await dispatch({ type: "resumeMultiple", sessionIds: ["a", "b", "c"] }, ctx);

    expect(resumeSession).toHaveBeenCalledTimes(3);
    expect(resumeSession.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
    // forceTerminal — the Claude Code extension chat tab is single-instance.
    expect(resumeSession.mock.calls.every((c) => c[3] === true)).toBe(true);
  });

  it("explains an empty group instead of doing nothing", async () => {
    const info = vi.spyOn(vscode.window, "showInformationMessage");
    const { ctx } = harness([]);

    await dispatch({ type: "resumeMultiple", sessionIds: [] }, ctx);

    expect(resumeSession).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Nothing to restore"));
  });

  it("focuses a live session's terminal instead of resuming it twice", async () => {
    const sessions = [session({ id: "live", isLive: true })];
    const { ctx, viewed } = harness(sessions, ["live"]);

    await dispatch({ type: "resumeMultiple", sessionIds: ["live"] }, ctx);

    expect(resumeSession).not.toHaveBeenCalled();
    expect(viewed).toEqual(["live"]);
  });

  it("skips live sessions, resumes the rest, and says how many were skipped", async () => {
    const info = vi.spyOn(vscode.window, "showInformationMessage");
    const sessions = [session({ id: "live", isLive: true }), session({ id: "cold" })];
    const { ctx, viewed } = harness(sessions);

    await dispatch({ type: "resumeMultiple", sessionIds: ["live", "cold"] }, ctx);

    expect(resumeSession.mock.calls.map((c) => c[0])).toEqual(["cold"]);
    // Nothing is revealed while new terminals are spawning — that would steal
    // focus from the terminal the click just created.
    expect(viewed).toEqual([]);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("already running"));
  });

  it("treats a tracked terminal as live even without the isLive flag", async () => {
    const sessions = [session({ id: "tracked" })];
    const { ctx, viewed } = harness(sessions, ["tracked"]);

    await dispatch({ type: "resumeMultiple", sessionIds: ["tracked"] }, ctx);

    expect(resumeSession).not.toHaveBeenCalled();
    expect(viewed).toEqual(["tracked"]);
  });

  it("confirms before opening more than four terminals", async () => {
    const warn = vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined);
    const ids = ["a", "b", "c", "d", "e"];
    const { ctx } = harness(ids.map((id) => session({ id })));

    await dispatch({ type: "resumeMultiple", sessionIds: ids }, ctx);

    expect(warn).toHaveBeenCalledWith(
      "Restore 5 sessions?",
      expect.objectContaining({ modal: true }),
      "Restore",
    );
    expect(resumeSession).not.toHaveBeenCalled();
  });

  it("proceeds with a large group once confirmed", async () => {
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(
      "Restore" as unknown as vscode.MessageItem,
    );
    const ids = ["a", "b", "c", "d", "e"];
    const { ctx } = harness(ids.map((id) => session({ id })));

    await dispatch({ type: "resumeMultiple", sessionIds: ids }, ctx);

    expect(resumeSession.mock.calls.map((c) => c[0])).toEqual(ids);
  });

  it("does not confirm at the four-terminal threshold", async () => {
    const warn = vi.spyOn(vscode.window, "showWarningMessage");
    const ids = ["a", "b", "c", "d"];
    const { ctx } = harness(ids.map((id) => session({ id })));

    await dispatch({ type: "resumeMultiple", sessionIds: ids }, ctx);

    expect(warn).not.toHaveBeenCalled();
    expect(resumeSession).toHaveBeenCalledTimes(4);
  });
});

describe("dispatch — ack pairing", () => {
  it("acks a well-formed message exactly once", async () => {
    const { ctx, posted } = harness([session({ id: "a" })]);

    await dispatch({ type: "resumeMultiple", sessionIds: ["a"] }, ctx);

    expect(posted.filter((m) => (m as { type: string }).type === "ack")).toHaveLength(1);
  });

  it("acks a message the protocol schema rejects", async () => {
    // The webview arms its busy indicator on send and clears it on ack.
    // Dropping a rejected message without replying left that indicator
    // lit until the client-side stuck timeout fired.
    const { ctx, posted } = harness([]);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await dispatch(
      { type: "definitelyNotAMessageType" } as never,
      ctx,
    );

    expect(posted).toEqual([{ type: "ack" }]);
  });
});
