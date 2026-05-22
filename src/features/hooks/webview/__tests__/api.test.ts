import { describe, it, expect, vi } from "vitest";
import type { Hook } from "../../types";
import * as api from "../api";

const sampleHook: Hook = {
  event: "PreToolUse",
  matcher: "Write",
  command: "echo hi",
  scope: "global",
  disabled: false,
};

describe("hooks api helpers", () => {
  it("getHooks posts a getHooks message", () => {
    const post = vi.fn();
    api.getHooks(post);
    expect(post).toHaveBeenCalledWith({ type: "getHooks" });
  });

  it("openSettingsFile posts the scope", () => {
    const post = vi.fn();
    api.openSettingsFile(post, "project");
    expect(post).toHaveBeenCalledWith({ type: "openSettingsFile", scope: "project" });
  });

  it("toggleHookEnabled posts the hook", () => {
    const post = vi.fn();
    api.toggleHookEnabled(post, sampleHook);
    expect(post).toHaveBeenCalledWith({ type: "toggleHookEnabled", hook: sampleHook });
  });

  it("deleteHook posts the hook", () => {
    const post = vi.fn();
    api.deleteHook(post, sampleHook);
    expect(post).toHaveBeenCalledWith({ type: "deleteHook", hook: sampleHook });
  });

  it("updateHook posts original + next", () => {
    const post = vi.fn();
    api.updateHook(post, sampleHook, { matcher: "Bash", command: "ls" });
    expect(post).toHaveBeenCalledWith({
      type: "updateHook",
      original: sampleHook,
      next: { matcher: "Bash", command: "ls" },
    });
  });

  it("promptAddHook posts a promptAddHook message", () => {
    const post = vi.fn();
    api.promptAddHook(post);
    expect(post).toHaveBeenCalledWith({ type: "promptAddHook" });
  });
});
