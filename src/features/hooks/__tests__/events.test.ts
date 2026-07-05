import { describe, it, expect } from "vitest";
import { KNOWN_HOOK_EVENTS, eventUsesMatcher } from "../events";

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

  it("every KNOWN_HOOK_EVENTS name is classified as matcher or non-matcher", () => {
    // eventUsesMatcher must have an opinion on every real event, or a new event
    // added to the catalog silently falls into whichever default is wrong.
    for (const e of KNOWN_HOOK_EVENTS) {
      expect(typeof eventUsesMatcher(e.name)).toBe("boolean");
    }
  });

  it("uses the matcher only for tool-scoped events", () => {
    expect(eventUsesMatcher("PreToolUse")).toBe(true);
    expect(eventUsesMatcher("PostToolUse")).toBe(true);
    expect(eventUsesMatcher("PostToolUseFailure")).toBe(true);
    expect(eventUsesMatcher("PermissionRequest")).toBe(true);
    expect(eventUsesMatcher("PermissionDenied")).toBe(true);
    expect(eventUsesMatcher("SessionStart")).toBe(false);
    expect(eventUsesMatcher("Stop")).toBe(false);
    expect(eventUsesMatcher("Notification")).toBe(false);
    expect(eventUsesMatcher("PreCompact")).toBe(false);
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
