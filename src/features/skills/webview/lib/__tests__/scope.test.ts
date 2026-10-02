import { describe, expect, it } from "vitest";
import { makeSkill } from "../../__tests__/fixtures";
import { readOnlyReason, scopeTone } from "../scope";

describe("scopeTone", () => {
  it("borrows the builtin tone for claude.ai and passes the rest through", () => {
    expect(scopeTone("claude.ai")).toBe("builtin");
    expect(scopeTone("project")).toBe("project");
    expect(scopeTone("global")).toBe("global");
    expect(scopeTone("plugin")).toBe("plugin");
  });
});

describe("readOnlyReason", () => {
  it("lets global and project skills be edited", () => {
    expect(readOnlyReason(makeSkill({ scope: "global" }))).toBeNull();
    expect(readOnlyReason(makeSkill({ scope: "project" }))).toBeNull();
  });

  it("says a claude.ai skill is synced and edits are not saved to the account", () => {
    expect(readOnlyReason(makeSkill({ scope: "claude.ai" }))).toMatch(
      /Synced from your claude\.ai account.*not saved to your account/,
    );
  });

  it("names the owning plugin", () => {
    expect(readOnlyReason(makeSkill({ scope: "plugin", pluginName: "design@synced" }))).toMatch(
      /plugin design@synced/,
    );
  });
});
