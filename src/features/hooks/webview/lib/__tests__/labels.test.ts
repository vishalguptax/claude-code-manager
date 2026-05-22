import { describe, it, expect } from "vitest";
import { eventLabel, matcherDisplay, scopeLabel } from "../labels";

describe("hooks event helpers", () => {
  it("eventLabel maps known events and falls back to raw name", () => {
    expect(eventLabel("PreToolUse")).toBe("Pre Tool Use");
    expect(eventLabel("SubagentStop")).toBe("Subagent Stop");
    expect(eventLabel("CustomThing")).toBe("CustomThing");
  });

  it("scopeLabel maps editable scopes", () => {
    expect(scopeLabel({ scope: "global" })).toBe("Global");
    expect(scopeLabel({ scope: "project" })).toBe("Project");
    expect(scopeLabel({ scope: "local" })).toBe("Local");
  });

  it("scopeLabel folds the plugin name into the badge", () => {
    expect(scopeLabel({ scope: "plugin", pluginName: "caveman@caveman" })).toBe(
      "Plugin: caveman@caveman",
    );
    expect(scopeLabel({ scope: "plugin" })).toBe("Plugin: unknown");
  });

  it("matcherDisplay shows a placeholder for blank matchers", () => {
    expect(matcherDisplay("Write")).toBe("Write");
    expect(matcherDisplay("")).toBe("* (any)");
  });
});
