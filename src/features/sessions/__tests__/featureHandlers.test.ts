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
const mockMoveHookToFile = vi.fn();
const mockAddHook = vi.fn();
const mockResolveSettingsPath = vi.fn();
const mockGetWorkspace = vi.fn(() => "");
const mockParseSkills = vi.fn(() => []);
const mockParseAgents = vi.fn(() => ({ agents: [], errors: [] }));
const mockSendText = vi.fn();
const mockCreateTerminal = vi.fn(() => ({ show: vi.fn(), sendText: mockSendText }));

vi.mock("../../hooks/parser", () => ({ parseHooks: (...args: unknown[]) => mockParseHooks(...args) }));
vi.mock("../../hooks/writer", () => ({
  toggleHookEnabled: (...args: unknown[]) => mockToggleHookEnabled(...args),
  deleteHook: (...args: unknown[]) => mockDeleteHook(...args),
  updateHook: (...args: unknown[]) => mockUpdateHook(...args),
  moveHookToFile: (...args: unknown[]) => mockMoveHookToFile(...args),
  addHook: (...args: unknown[]) => mockAddHook(...args),
}));
vi.mock("../../account/parser", () => ({
  resolveSettingsPath: (...args: unknown[]) => mockResolveSettingsPath(...args),
}));
vi.mock("../../../extension/workspace", () => ({ getWorkspace: () => mockGetWorkspace() }));
vi.mock("../../../extension/terminal", () => ({
  createTerminal: (...args: unknown[]) => mockCreateTerminal(...args),
  runInTerminal: (term: { sendText: (t: string) => void }, cmd: string) => term.sendText(cmd),
}));
vi.mock("../../skills/parser", () => ({ parseSkills: () => mockParseSkills() }));
vi.mock("../../agents/parser", () => ({ parseAgents: () => mockParseAgents() }));

import { handleFeatureMessage } from "../featureHandlers";

/** A writer refusal; the handler must pass its reason through verbatim. */
const REFUSAL = "/ws/.claude/settings.json isn't valid JSON, so it was left untouched";

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
  mockCreateTerminal.mockReturnValue({ show: vi.fn(), sendText: mockSendText });
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
    mockToggleHookEnabled.mockReturnValue({ ok: false, error: REFUSAL });
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx, posted } = harness();
    const hook = makeHook();
    await handleFeatureMessage({ type: "toggleHookEnabled", hook }, ctx);
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toBe(`Failed to disable hook: ${REFUSAL}. The list has been refreshed.`);
    expect(mockParseHooks).toHaveBeenCalled();
    expect(posted[0]).toMatchObject({ type: "hooks" });
  });

  it("does not report an error on success", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockToggleHookEnabled.mockReturnValue({ ok: true });
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
  it("surfaces the writer's reason for a failure", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockDeleteHook.mockReturnValue({ ok: false, error: REFUSAL });
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Delete" as never);
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleFeatureMessage({ type: "deleteHook", hook: makeHook() }, ctx);
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toBe(`Failed to delete hook: ${REFUSAL}. The list has been refreshed.`);
  });

  it("does nothing when the confirm modal is dismissed", async () => {
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined);
    const { ctx } = harness();
    await handleFeatureMessage({ type: "deleteHook", hook: makeHook() }, ctx);
    expect(mockDeleteHook).not.toHaveBeenCalled();
  });
});

describe("updateHook", () => {
  it("surfaces the writer's reason (e.g. non-command hook, or edited on disk)", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockUpdateHook.mockReturnValue({ ok: false, error: REFUSAL });
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleFeatureMessage(
      { type: "updateHook", original: makeHook(), next: { matcher: "Edit", command: "echo new" } },
      ctx,
    );
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toBe(`Failed to update hook: ${REFUSAL}. The list has been refreshed.`);
  });

  it("does not report an error on success", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockUpdateHook.mockReturnValue({ ok: true });
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleFeatureMessage(
      { type: "updateHook", original: makeHook(), next: { matcher: "Edit", command: "echo new" } },
      ctx,
    );
    expect(err).not.toHaveBeenCalled();
  });

  it("uses updateHook (same file) when the scope is unchanged", async () => {
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockUpdateHook.mockReturnValue({ ok: true });
    const { ctx } = harness();
    await handleFeatureMessage(
      {
        type: "updateHook",
        original: makeHook({ scope: "global" }),
        next: { matcher: "W", command: "c", scope: "global" },
      },
      ctx,
    );
    expect(mockUpdateHook).toHaveBeenCalled();
    expect(mockMoveHookToFile).not.toHaveBeenCalled();
  });

  it("uses moveHookToFile when the scope changes", async () => {
    mockResolveSettingsPath.mockImplementation((scope: string) => `/ws/.claude/${scope}.json`);
    mockMoveHookToFile.mockReturnValue({ ok: true });
    const { ctx } = harness();
    await handleFeatureMessage(
      {
        type: "updateHook",
        original: makeHook({ scope: "global" }),
        next: { matcher: "W", command: "c", scope: "project" },
      },
      ctx,
    );
    expect(mockMoveHookToFile).toHaveBeenCalledWith(
      "/ws/.claude/global.json",
      "/ws/.claude/project.json",
      expect.objectContaining({ scope: "global" }),
      expect.objectContaining({ scope: "project" }),
    );
    expect(mockUpdateHook).not.toHaveBeenCalled();
  });
});

describe("openHooksPanel", () => {
  it("launches claude and types /hooks after the REPL starts", async () => {
    vi.useFakeTimers();
    const { ctx } = harness();
    await handleFeatureMessage({ type: "openHooksPanel" }, ctx);
    expect(mockCreateTerminal).toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledWith("claude");
    vi.advanceTimersByTime(1800);
    expect(mockSendText).toHaveBeenCalledWith("/hooks");
    vi.useRealTimers();
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
    mockAddHook.mockReturnValue({ ok: true });
    const { ctx } = harness();
    await handleFeatureMessage({ type: "promptAddHook" }, ctx);
    expect(mockAddHook).toHaveBeenCalledWith("/ws/.claude/settings.json", "PreToolUse", "Write", "echo hi");
  });

  it("names what a non-tool event's matcher is tested against", async () => {
    vi.spyOn(vscode.window, "showQuickPick")
      .mockResolvedValueOnce({ label: "Global", value: "global" } as never)
      .mockResolvedValueOnce({ label: "SessionStart" } as never);
    const input = vi
      .spyOn(vscode.window, "showInputBox")
      .mockResolvedValueOnce("compact")
      .mockResolvedValueOnce("echo hi");
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockAddHook.mockReturnValue({ ok: true });
    const { ctx } = harness();
    await handleFeatureMessage({ type: "promptAddHook" }, ctx);
    expect(input.mock.calls[0][0]?.placeHolder).toContain("startup|resume|clear|compact");
    expect(mockAddHook).toHaveBeenCalledWith("/ws/.claude/settings.json", "SessionStart", "compact", "echo hi");
  });

  it("skips the matcher prompt for an event Claude Code never matches", async () => {
    vi.spyOn(vscode.window, "showQuickPick")
      .mockResolvedValueOnce({ label: "Global", value: "global" } as never)
      .mockResolvedValueOnce({ label: "Stop" } as never);
    const input = vi.spyOn(vscode.window, "showInputBox").mockResolvedValueOnce("echo hi");
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockAddHook.mockReturnValue({ ok: true });
    const { ctx } = harness();
    await handleFeatureMessage({ type: "promptAddHook" }, ctx);
    expect(input).toHaveBeenCalledTimes(1);
    expect(mockAddHook).toHaveBeenCalledWith("/ws/.claude/settings.json", "Stop", "", "echo hi");
  });

  it("offers Project and Local scopes when a workspace is open", async () => {
    mockGetWorkspace.mockReturnValueOnce("/ws");
    mockResolveSettingsPath.mockImplementation((scope: string) => `/ws/${scope}.json`);
    const pick = vi.spyOn(vscode.window, "showQuickPick").mockResolvedValueOnce(undefined);
    const { ctx } = harness();
    await handleFeatureMessage({ type: "promptAddHook" }, ctx);
    const scopes = (pick.mock.calls[0][0] as { value: string }[]).map((c) => c.value);
    expect(scopes).toEqual(["global", "project", "local"]);
  });

  it("omits Project when the home folder is open (it would be the global file)", async () => {
    mockGetWorkspace.mockReturnValueOnce("/home/me");
    mockResolveSettingsPath.mockImplementation((scope: string) =>
      scope === "project" ? null : `/home/me/${scope}.json`,
    );
    const pick = vi.spyOn(vscode.window, "showQuickPick").mockResolvedValueOnce(undefined);
    const { ctx } = harness();
    await handleFeatureMessage({ type: "promptAddHook" }, ctx);
    const scopes = (pick.mock.calls[0][0] as { value: string }[]).map((c) => c.value);
    expect(scopes).toEqual(["global", "local"]);
  });

  it("surfaces a failure from the writer", async () => {
    vi.spyOn(vscode.window, "showQuickPick")
      .mockResolvedValueOnce({ label: "Global", value: "global" } as never)
      .mockResolvedValueOnce({ label: "PreToolUse" } as never);
    vi.spyOn(vscode.window, "showInputBox")
      .mockResolvedValueOnce("Write")
      .mockResolvedValueOnce("echo hi");
    mockResolveSettingsPath.mockReturnValue("/ws/.claude/settings.json");
    mockAddHook.mockReturnValue({ ok: false, error: REFUSAL });
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleFeatureMessage({ type: "promptAddHook" }, ctx);
    expect(err).toHaveBeenCalledWith(`Failed to add hook: ${REFUSAL}. The list has been refreshed.`);
  });
});

describe("setTabPreferences", () => {
  it("writes hiddenTabs and tabOrder to the same config service, both at User scope", async () => {
    const updates: Array<[string, unknown, unknown]> = [];
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: (_key: string, def?: unknown) => def,
      inspect: () => undefined,
      update: async (key: string, value: unknown, target?: unknown) => {
        updates.push([key, value, target]);
      },
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    const { ctx } = harness();
    const handled = await handleFeatureMessage(
      { type: "setTabPreferences", hidden: ["checkpoints"], order: ["account", "config"] },
      ctx,
    );

    expect(handled).toBe(true);
    expect(updates).toEqual([
      ["hiddenTabs", ["checkpoints"], vscode.ConfigurationTarget.Global],
      ["tabOrder", ["account", "config"], vscode.ConfigurationTarget.Global],
    ]);
  });

  it("writes both arrays even when empty, so clearing every preference round-trips", async () => {
    const updates: Array<[string, unknown]> = [];
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: (_key: string, def?: unknown) => def,
      inspect: () => undefined,
      update: async (key: string, value: unknown) => {
        updates.push([key, value]);
      },
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    const { ctx } = harness();
    await handleFeatureMessage({ type: "setTabPreferences", hidden: [], order: [] }, ctx);

    expect(updates).toEqual([
      ["hiddenTabs", []],
      ["tabOrder", []],
    ]);
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
