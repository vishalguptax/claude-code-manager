import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import type { Agent } from "../types";
import type { AgentHostContext } from "../messageHandlers";
import type { AgentInput } from "../../../shared/protocol/messages";

const mockParseAgents = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockDuplicate = vi.fn();

vi.mock("../parser", () => ({ parseAgents: (...a: unknown[]) => mockParseAgents(...a) }));
vi.mock("../writer", () => ({
  createAgent: (...a: unknown[]) => mockCreate(...a),
  updateAgent: (...a: unknown[]) => mockUpdate(...a),
  deleteAgent: (...a: unknown[]) => mockDelete(...a),
  duplicateAgent: (...a: unknown[]) => mockDuplicate(...a),
}));

import { handleAgentMessage } from "../messageHandlers";

function agentInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    scope: "global",
    name: "reviewer",
    description: "d",
    model: "opus",
    tools: [],
    skills: [],
    body: "b",
    ...overrides,
  };
}

interface Harness {
  ctx: AgentHostContext;
  posted: unknown[];
  setAgents: Agent[][];
}

function harness(withWebview = true): Harness {
  const posted: unknown[] = [];
  const setAgents: Agent[][] = [];
  const wv = withWebview
    ? ({ postMessage: (m: unknown) => posted.push(m) } as unknown as vscode.Webview)
    : undefined;
  const ctx: AgentHostContext = {
    getWebview: () => wv,
    getWorkspace: () => "/ws",
    setAgents: (a) => setAgents.push(a),
  };
  return { ctx, posted, setAgents };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockParseAgents.mockReturnValue({ agents: [], errors: [] });
  mockCreate.mockReturnValue({ ok: true });
  mockUpdate.mockReturnValue({ ok: true });
  mockDelete.mockReturnValue({ ok: true });
  mockDuplicate.mockReturnValue({ ok: true });
});

describe("handleAgentMessage — routing", () => {
  it("ignores non-agent messages", async () => {
    const { ctx } = harness();
    expect(await handleAgentMessage({ type: "getSkills" }, ctx)).toBe(false);
  });

  it("claims and rejects a malformed agent message", async () => {
    const { ctx, posted } = harness();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await handleAgentMessage({ type: "createAgent" }, ctx)).toBe(true);
    expect(posted).toHaveLength(0);
    expect(err).toHaveBeenCalled();
  });
});

describe("getAgents", () => {
  it("parses, caches, and posts with errors", async () => {
    mockParseAgents.mockReturnValue({ agents: [{ name: "a" }], errors: ["oops"] });
    const { ctx, posted, setAgents } = harness();
    expect(await handleAgentMessage({ type: "getAgents" }, ctx)).toBe(true);
    expect(setAgents[0]).toEqual([{ name: "a" }]);
    expect(posted[0]).toMatchObject({ type: "agents", errors: ["oops"] });
  });
});

describe("createAgent / updateAgent / duplicateAgent", () => {
  it("createAgent surfaces the writer error and still refreshes", async () => {
    mockCreate.mockReturnValue({ ok: false, error: "dup name" });
    const errSpy = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx, posted } = harness();
    await handleAgentMessage({ type: "createAgent", agent: agentInput() }, ctx);
    expect(mockCreate).toHaveBeenCalledWith(agentInput(), "/ws");
    expect(errSpy).toHaveBeenCalledWith("dup name");
    expect(posted.at(-1)).toMatchObject({ type: "agents" });
  });

  it("updateAgent passes path + input and refreshes on success", async () => {
    const errSpy = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx, posted } = harness();
    await handleAgentMessage(
      { type: "updateAgent", path: "/a/x.md", agent: agentInput() },
      ctx,
    );
    expect(mockUpdate).toHaveBeenCalledWith("/a/x.md", agentInput());
    expect(errSpy).not.toHaveBeenCalled();
    expect(posted.at(-1)).toMatchObject({ type: "agents" });
  });

  it("duplicateAgent calls the writer with the path", async () => {
    const { ctx } = harness();
    await handleAgentMessage({ type: "duplicateAgent", path: "/a/x.md" }, ctx);
    expect(mockDuplicate).toHaveBeenCalledWith("/a/x.md");
  });
});

describe("deleteAgent", () => {
  it("deletes after the user confirms", async () => {
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Delete" as never);
    const { ctx, posted } = harness();
    await handleAgentMessage({ type: "deleteAgent", path: "/a/x.md" }, ctx);
    expect(mockDelete).toHaveBeenCalledWith("/a/x.md");
    expect(posted.at(-1)).toMatchObject({ type: "agents" });
  });

  it("does nothing when the confirm is dismissed", async () => {
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined);
    const { ctx } = harness();
    await handleAgentMessage({ type: "deleteAgent", path: "/a/x.md" }, ctx);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
