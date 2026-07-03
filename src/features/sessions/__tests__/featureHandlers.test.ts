/**
 * Tests for the hooks/agents/skills message handlers in featureHandlers.ts.
 * Focuses on the hooks paths since that's where write-failure surfacing
 * and error pass-through were added — the parser/writer are mocked so
 * these tests assert wiring, not parsing/writing behaviour (covered by
 * ../../hooks/__tests__/parser.test.ts and writer.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import type { Hook } from "../../hooks/types";
import type { HostContext } from "../hostContext";

const mockParseHooks = vi.fn();
const mockToggleHookEnabled = vi.fn();
const mockDeleteHook = vi.fn();
const mockUpdateHook = vi.fn();
const mockAddHook = vi.fn();
const mockResolveSettingsPath = vi.fn();
const mockGetWorkspace = vi.fn(() => "");
const mockParseSkills = vi.fn(() => []);
const mockParseAgents = vi.fn(() => ({ agents: [], errors: [] }));

vi.mock("../../hooks/parser", () => ({ parseHooks: (...args: unknown[]) => mockParseHooks(...args) }));
vi.mock("../../hooks/writer", () => ({
  toggleHookEnabled: (...args: unknown[]) => mockToggleHookEnabled(...args),
  deleteHook: (...args: unknown[]) => mockDeleteHook(...args),
  updateHook: (...args: unknown[]) => mockUpdateHook(...args),
  addHook: (...args: unknown[]) => mockAddHook(...args),
}));
vi.mock("../../account/parser", () => ({
  resolveSettingsPath: (...args: unknown[]) => mockResolveSettingsPath(...args),
}));
vi.mock("../../../extension/workspace", () => ({ getWorkspace: () => mockGetWorkspace() }));
vi.mock("../../skills/parser", () => ({ parseSkills: () => mockParseSkills() }));
vi.mock("../../agents/parser", () => ({ parseAgents: () => mockParseAgents() }));

import { handleFeatureMessage } from "../featureHandlers";

function makeHook(overrides: Partial<Hook> = {}): Hook {
  return {
    event: "PreToolUse",
    matcher: "Write",
    command: "echo hi",
    scope: "global",
    disabled: false,
    hookType: "command",
    entryIndex: 0,
    commandIndex: null,
    ...overrides,
  };
}

interface Harness {
  ctx: HostContext;
  posted: unknown[];
  hooksSet: Hook[][];
}

function harness(): Harness {
  const posted: unknown[] = [];
  const hooksSet: Hook[][] = [];
  const ctx = {
    getWebview: () => ({ postMessage: (m: unknown) => posted.push(m) }) as unknown as vscode.Webview,
    getSkills: () => [],
    setSkills: () => {},
    setCommands: () => {},
    setHooks: (h: Hook[]) => hooksSet.push(h),
    getMcpServers: () => [],
    setMcpServers: () => {},
    setAgents: () => {},
  } as unknown as HostContext;
  return { ctx, posted, hooksSet };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWorkspace.mockReturnValue("");
  mockParseHooks.mockReturnValue({ hooks: [], errors: [] });
});

describe("getHooks", () => {
  it("posts the hooks list and any parse errors from the parser", async () => {
    mockParseHooks.mockReturnValue({
      hooks: [makeHook()],
      errors: ["Failed to parse /ws/.claude/settings.json: Unexpected token"],
    });
    const { ctx, posted, hooksSet } = harness();
    expect(await handleFeatureMessage({ type: "getHooks" }, ctx)).toBe(true);
    expect(hooksSet[0]).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      type: "hooks",
      errors: ["Failed to parse /ws/.claude/settings.json: Unexpected token"],
    });
  });
});

describe("toggleHookEnabled", () => {
  it("surfaces a failure with showErrorMessage and still refreshes the list", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockToggleHookEnabled.mockReturnValue(false);
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx, posted } = harness();
    const hook = makeHook();
    await handleFeatureMessage({ type: "toggleHookEnabled", hook }, ctx);
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toContain("Failed to disable hook");
    expect(mockParseHooks).toHaveBeenCalled();
    expect(posted[0]).toMatchObject({ type: "hooks" });
  });

  it("does not report an error on success", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockToggleHookEnabled.mockReturnValue(true);
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleFeatureMessage({ type: "toggleHookEnabled", hook: makeHook() }, ctx);
    expect(err).not.toHaveBeenCalled();
  });

  it("ignores plugin-scoped hooks without resolving a settings path", async () => {
    const { ctx } = harness();
    await handleFeatureMessage(
      { type: "toggleHookEnabled", hook: makeHook({ scope: "plugin", pluginName: "p@p" }) },
      ctx,
    );
    expect(mockResolveSettingsPath).not.toHaveBeenCalled();
    expect(mockToggleHookEnabled).not.toHaveBeenCalled();
  });
});

describe("deleteHook", () => {
  it("surfaces a failure when the writer can't find the hook", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockDeleteHook.mockReturnValue(false);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Delete" as never);
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleFeatureMessage({ type: "deleteHook", hook: makeHook() }, ctx);
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toContain("Failed to delete hook");
  });

  it("does nothing when the confirm modal is dismissed", async () => {
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined);
    const { ctx } = harness();
    await handleFeatureMessage({ type: "deleteHook", hook: makeHook() }, ctx);
    expect(mockDeleteHook).not.toHaveBeenCalled();
  });
});

describe("updateHook", () => {
  it("surfaces a failure (e.g. non-command hook, or edited on disk)", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockUpdateHook.mockReturnValue(false);
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleFeatureMessage(
      { type: "updateHook", original: makeHook(), next: { matcher: "Edit", command: "echo new" } },
      ctx,
    );
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toContain("Failed to update hook");
  });

  it("does not report an error on success", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockUpdateHook.mockReturnValue(true);
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleFeatureMessage(
      { type: "updateHook", original: makeHook(), next: { matcher: "Edit", command: "echo new" } },
      ctx,
    );
    expect(err).not.toHaveBeenCalled();
  });
});

describe("promptAddHook", () => {
  it("calls addHook without a scope argument and refreshes on success", async () => {
    vi.spyOn(vscode.window, "showQuickPick")
      .mockResolvedValueOnce({ label: "Global", value: "global" } as never)
      .mockResolvedValueOnce({ label: "PreToolUse" } as never);
    vi.spyOn(vscode.window, "showInputBox")
      .mockResolvedValueOnce("Write") // matcher
      .mockResolvedValueOnce("echo hi"); // command
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockAddHook.mockReturnValue(true);
    const { ctx } = harness();
    await handleFeatureMessage({ type: "promptAddHook" }, ctx);
    expect(mockAddHook).toHaveBeenCalledWith("/ws/.claude/settings.json", "PreToolUse", "Write", "echo hi");
  });

  it("surfaces a failure from the writer", async () => {
    vi.spyOn(vscode.window, "showQuickPick")
      .mockResolvedValueOnce({ label: "Global", value: "global" } as never)
      .mockResolvedValueOnce({ label: "PreToolUse" } as never);
    vi.spyOn(vscode.window, "showInputBox")
      .mockResolvedValueOnce("Write")
      .mockResolvedValueOnce("echo hi");
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockAddHook.mockReturnValue(false);
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleFeatureMessage({ type: "promptAddHook" }, ctx);
    expect(err).toHaveBeenCalledWith("Failed to write hook to settings.json.");
  });
});

describe("routing", () => {
  it("returns false for an unhandled message type", async () => {
    const { ctx } = harness();
    expect(await handleFeatureMessage({ type: "reloadAll" }, ctx)).toBe(false);
  });

  it("returns true and does nothing when there is no webview", async () => {
    const ctx = { getWebview: () => undefined } as unknown as HostContext;
    expect(await handleFeatureMessage({ type: "getHooks" }, ctx)).toBe(true);
    expect(mockParseHooks).not.toHaveBeenCalled();
  });
});
