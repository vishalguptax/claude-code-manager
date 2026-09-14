import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import {
  CLAUDE_CODE_EXTENSION_ID,
  isClaudeCodeExtensionInstalled,
  openSessionInExtension,
  openPromptInExtension,
  resetChatOpenCommandProbe,
} from "../claudeCodeExtension";

const CHAT_OPEN_COMMAND = "claude-vscode.editor.open";

/**
 * Put the host in the one state where the command path is taken: the
 * official extension installed and active, its open command registered,
 * and the user's `claudeCode.preferredLocation` set to `sidebar`.
 */
function withSidebarPreference(
  overrides: {
    commands?: string[];
    activate?: () => Promise<void>;
    isActive?: boolean;
  } = {},
) {
  vi.spyOn(vscode.workspace, "getConfiguration").mockImplementation(
    (section?: string) =>
      ({
        get: (key: string, defaultValue?: unknown) =>
          section === "claudeCode" && key === "preferredLocation"
            ? "sidebar"
            : defaultValue,
      }) as never,
  );
  vi.spyOn(vscode.extensions, "getExtension").mockImplementation((id: string) =>
    id === CLAUDE_CODE_EXTENSION_ID
      ? ({
          isActive: overrides.isActive ?? true,
          activate: overrides.activate ?? (async () => {}),
        } as never)
      : undefined,
  );
  vi.spyOn(vscode.commands, "getCommands").mockResolvedValue(
    overrides.commands ?? [CHAT_OPEN_COMMAND],
  );
  return {
    execute: vi
      .spyOn(vscode.commands, "executeCommand")
      .mockResolvedValue(undefined as never),
    openExternal: vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetChatOpenCommandProbe();
});

describe("isClaudeCodeExtensionInstalled", () => {
  it("returns true when the extension is installed", () => {
    vi.spyOn(vscode.extensions, "getExtension").mockImplementation((id: string) =>
      id === CLAUDE_CODE_EXTENSION_ID ? ({ isActive: true } as never) : undefined,
    );
    expect(isClaudeCodeExtensionInstalled()).toBe(true);
  });

  it("returns false when the extension is not installed", () => {
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined as never);
    expect(isClaudeCodeExtensionInstalled()).toBe(false);
  });

  it("returns true even when the extension is inactive (not yet activated)", () => {
    // We only care about presence — the URI handler will activate it.
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
      isActive: false,
    } as never);
    expect(isClaudeCodeExtensionInstalled()).toBe(true);
  });
});

describe("openSessionInExtension", () => {
  it("fires the URI handler with the session id encoded", async () => {
    const spy = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);
    await openSessionInExtension("abc-123");
    expect(spy).toHaveBeenCalledTimes(1);
    const uri = spy.mock.calls[0][0] as vscode.Uri;
    expect(uri.toString()).toContain("vscode://anthropic.claude-code/open");
    expect(uri.toString()).toContain("session=abc-123");
  });

  it("URL-encodes session ids that contain special characters", async () => {
    const spy = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);
    await openSessionInExtension("weird id/with?chars");
    const uri = spy.mock.calls[0][0] as vscode.Uri;
    expect(uri.toString()).toContain("session=weird%20id%2Fwith%3Fchars");
  });

  it("uses the host's own URI scheme so forks resume in-place", async () => {
    // In Cursor/Windsurf the scheme is not "vscode" — firing a vscode://
    // URI there would launch a separate VS Code window. The deep link
    // must adopt vscode.env.uriScheme so it routes back to this host.
    const original = vscode.env.uriScheme;
    (vscode.env as { uriScheme: string }).uriScheme = "cursor";
    try {
      const spy = vi
        .spyOn(vscode.env, "openExternal")
        .mockResolvedValue(true as never);
      await openSessionInExtension("abc-123");
      const uri = spy.mock.calls[0][0] as vscode.Uri;
      expect(uri.toString()).toContain("cursor://anthropic.claude-code/open");
      expect(uri.toString()).not.toContain("vscode://");
    } finally {
      (vscode.env as { uriScheme: string }).uriScheme = original;
    }
  });
});

describe("openPromptInExtension", () => {
  it("fires the URI handler with the prompt encoded", async () => {
    const spy = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);
    await openPromptInExtension("refactor the parser");
    const uri = spy.mock.calls[0][0] as vscode.Uri;
    expect(uri.toString()).toContain("vscode://anthropic.claude-code/open");
    expect(uri.toString()).toContain("prompt=refactor%20the%20parser");
  });

  it("omits the prompt parameter entirely for an empty prompt", async () => {
    const spy = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);
    await openPromptInExtension("");
    const uri = spy.mock.calls[0][0] as vscode.Uri;
    expect(uri.toString()).toContain("vscode://anthropic.claude-code/open");
    expect(uri.toString()).not.toContain("prompt=");
  });

  it("handles prompts with reserved URL characters", async () => {
    const spy = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);
    await openPromptInExtension("hello & world?");
    const uri = spy.mock.calls[0][0] as vscode.Uri;
    expect(uri.toString()).toContain("prompt=hello%20%26%20world%3F");
  });
});

describe("side bar placement", () => {
  it("routes a session through the placement-aware command", async () => {
    const { execute, openExternal } = withSidebarPreference();
    await openSessionInExtension("abc-123");
    expect(openExternal).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      CHAT_OPEN_COMMAND,
      "abc-123",
      undefined,
      undefined,
      undefined,
      true,
      { programmatic: "honor-preferred-location" },
    );
  });

  it("routes a prompt through the same command", async () => {
    const { execute } = withSidebarPreference();
    await openPromptInExtension("refactor the parser");
    expect(execute).toHaveBeenCalledWith(
      CHAT_OPEN_COMMAND,
      undefined,
      "refactor the parser",
      undefined,
      undefined,
      true,
      { programmatic: "honor-preferred-location" },
    );
  });

  it("passes the exact token the extension's placement check requires", async () => {
    // Any other value routes to an editor tab, and omitting it entirely
    // makes the extension rewrite the user's preferredLocation setting.
    const { execute } = withSidebarPreference();
    await openSessionInExtension("abc-123");
    const opts = execute.mock.calls[0][6] as { programmatic: string };
    expect(opts.programmatic).toBe("honor-preferred-location");
  });

  it("activates a cold extension before probing for the command", async () => {
    const activate = vi.fn(async () => {});
    const { execute } = withSidebarPreference({ isActive: false, activate });
    await openSessionInExtension("abc-123");
    expect(activate).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalled();
  });

  it("still uses the URI when the target is a window we just opened", async () => {
    // Commands run in this extension host; only the URI crosses windows.
    const { execute, openExternal } = withSidebarPreference();
    await openSessionInExtension("abc-123", { newWindow: true });
    expect(execute).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledTimes(1);
  });
});

describe("side bar placement fallbacks", () => {
  it("uses the URI when the user has not asked for the side bar", async () => {
    // Default preferredLocation is "panel" — the mock returns the
    // caller's default, so this is the untouched-settings case.
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
      isActive: true,
      activate: async () => {},
    } as never);
    const getCommands = vi
      .spyOn(vscode.commands, "getCommands")
      .mockResolvedValue([CHAT_OPEN_COMMAND]);
    const execute = vi.spyOn(vscode.commands, "executeCommand");
    const openExternal = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);

    await openSessionInExtension("abc-123");

    expect(execute).not.toHaveBeenCalled();
    expect(getCommands).not.toHaveBeenCalled(); // not even probed
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it("uses the URI when the installed build lacks the command", async () => {
    const { execute, openExternal } = withSidebarPreference({ commands: [] });
    await openSessionInExtension("abc-123");
    expect(execute).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it("uses the URI when the extension is not installed", async () => {
    withSidebarPreference();
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined as never);
    const execute = vi.spyOn(vscode.commands, "executeCommand");
    const openExternal = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);
    await openSessionInExtension("abc-123");
    expect(execute).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it("uses the URI when activation throws", async () => {
    const { execute, openExternal } = withSidebarPreference({
      isActive: false,
      activate: async () => {
        throw new Error("activation failed");
      },
    });
    await openSessionInExtension("abc-123");
    expect(execute).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it("falls back to the URI when the command itself rejects", async () => {
    const { execute, openExternal } = withSidebarPreference();
    execute.mockRejectedValue(new Error("command failed"));
    await openSessionInExtension("abc-123");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it("re-probes after a negative result so a mid-session install is picked up", async () => {
    const { execute, openExternal } = withSidebarPreference({ commands: [] });
    await openSessionInExtension("abc-123");
    expect(openExternal).toHaveBeenCalledTimes(1);

    vi.spyOn(vscode.commands, "getCommands").mockResolvedValue([CHAT_OPEN_COMMAND]);
    await openSessionInExtension("abc-123");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledTimes(1); // no second URI
  });
});
