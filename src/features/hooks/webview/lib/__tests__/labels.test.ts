import { describe, it, expect } from "vitest";
import { eventLabel, matcherDisplay, scopeLabel } from "../labels";

describe("hooks event helpers", () => {
  it("eventLabel maps known events and falls back to raw name", () => {
    expect(eventLabel("PreToolUse")).toBe("Pre Tool Use");
    expect(eventLabel("SubagentStop")).toBe("Subagent Stop");
    expect(eventLabel("CustomThing")).toBe("CustomThing");
  });

  it("eventLabel covers the previously-missing event names", () => {
    expect(eventLabel("SessionStart")).toBe("Session Start");
    expect(eventLabel("SessionEnd")).toBe("Session End");
    expect(eventLabel("UserPromptSubmit")).toBe("User Prompt Submit");
    expect(eventLabel("PostToolUseFailure")).toBe("Post Tool Use Failure");
    expect(eventLabel("SubagentStart")).toBe("Subagent Start");
    expect(eventLabel("PostCompact")).toBe("Post Compact");
    expect(eventLabel("PermissionRequest")).toBe("Permission Request");
    expect(eventLabel("PermissionDenied")).toBe("Permission Denied");
  });

  it("scopeLabel maps editable scopes", () => {
    expect(scopeLabel({ scope: "global" })).toBe("global");
    expect(scopeLabel({ scope: "project" })).toBe("project");
    expect(scopeLabel({ scope: "local" })).toBe("local");
  });

  it("scopeLabel folds the plugin name into the badge", () => {
    expect(scopeLabel({ scope: "plugin", pluginName: "caveman@caveman" })).toBe(
      "plugin: caveman@caveman",
    );
    expect(scopeLabel({ scope: "plugin" })).toBe("plugin: unknown");
  });

  it("matcherDisplay shows a placeholder for blank matchers", () => {
    expect(matcherDisplay("Write")).toBe("Write");
    expect(matcherDisplay("")).toBe("* (any)");
  });
});
