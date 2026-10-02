import { describe, it, expect } from "vitest";
import {
  KNOWN_HOOK_EVENTS,
  eventUsesMatcher,
  matcherInfo,
  showsMatcher,
} from "../events";

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

  it("uses the matcher for tool events, matched against the tool name", () => {
    // Claude Code's tool events: their matcher is tested against tool_name.
    for (const name of [
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "PermissionRequest",
      "PermissionDenied",
    ]) {
      expect(eventUsesMatcher(name)).toBe(true);
      expect(matcherInfo(name)?.subject).toBe("Tool name or pattern");
    }
  });

  it("uses the matcher for the non-tool events Claude Code 2.1.287 matches on", () => {
    // Mirrors the CLI's match-query switch; before this the UI treated only
    // tool events as matchable and blanked e.g. a SessionStart "compact" matcher.
    for (const name of [
      "UserPromptExpansion",
      "SessionStart",
      "SessionEnd",
      "Setup",
      "PreCompact",
      "PostCompact",
      "PreModelSwitch",
      "PostModelSwitch",
      "Notification",
      "StopFailure",
      "SubagentStart",
      "SubagentStop",
      "Elicitation",
      "ElicitationResult",
      "ConfigChange",
      "DirectoryAdded",
      "InstructionsLoaded",
      "FileChanged",
    ]) {
      expect(eventUsesMatcher(name)).toBe(true);
    }
    expect(matcherInfo("SessionStart")).toEqual({
      subject: "Source",
      values: "startup|resume|clear|compact|fork",
    });
    expect(matcherInfo("PreCompact")?.values).toBe("manual|auto");
    expect(matcherInfo("Notification")?.subject).toBe("Notification type");
  });

  it("does not use the matcher for events Claude Code never matches on", () => {
    for (const name of ["Stop", "UserPromptSubmit", "PostToolBatch", "TeammateIdle", "CwdChanged"]) {
      expect(eventUsesMatcher(name)).toBe(false);
      expect(matcherInfo(name)).toBeUndefined();
    }
  });

  it("does not treat inherited object keys as events", () => {
    expect(eventUsesMatcher("toString")).toBe(false);
    expect(eventUsesMatcher("__proto__")).toBe(false);
  });

  it("shows a matcher for matchable events, and for any event that already has one", () => {
    expect(showsMatcher("SessionStart", "")).toBe(true);
    expect(showsMatcher("Stop", "")).toBe(false);
    // Unknown/future events: never hide (and so never drop) an existing matcher.
    expect(showsMatcher("SomeFutureEvent", "beta")).toBe(true);
    expect(showsMatcher("Stop", "leftover")).toBe(true);
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

  it("covers the events Claude Code 2.1 added since the catalog was written", () => {
    const names = KNOWN_HOOK_EVENTS.map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "PostToolBatch",
        "UserPromptExpansion",
        "StopFailure",
        "PreModelSwitch",
        "PostModelSwitch",
        "Setup",
        "TeammateIdle",
        "TaskCreated",
        "TaskCompleted",
        "Elicitation",
        "ElicitationResult",
        "ConfigChange",
        "WorktreeCreate",
        "WorktreeRemove",
        "InstructionsLoaded",
        "CwdChanged",
        "FileChanged",
        "DirectoryAdded",
        "MessageDisplay",
      ]),
    );
  });
});
