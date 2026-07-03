import { describe, it, expect } from "vitest";
import { KNOWN_HOOK_EVENTS } from "../events";

describe("KNOWN_HOOK_EVENTS", () => {
  it("has no duplicate event names", () => {
    const names = KNOWN_HOOK_EVENTS.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every entry has a non-empty name, label, and description", () => {
    for (const e of KNOWN_HOOK_EVENTS) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
    }
  });

  it("covers the documented Claude Code hook events", () => {
    const names = KNOWN_HOOK_EVENTS.map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "SessionStart",
        "SessionEnd",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "Notification",
        "Stop",
        "SubagentStart",
        "SubagentStop",
        "PreCompact",
        "PostCompact",
        "PermissionRequest",
        "PermissionDenied",
      ]),
    );
  });
});
