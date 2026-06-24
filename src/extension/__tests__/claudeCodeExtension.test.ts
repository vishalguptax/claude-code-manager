import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import {
  CLAUDE_CODE_EXTENSION_ID,
  isClaudeCodeExtensionInstalled,
  openSessionInExtension,
  openPromptInExtension,
} from "../claudeCodeExtension";

describe("isClaudeCodeExtensionInstalled", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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
