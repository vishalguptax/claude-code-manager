import { beforeEach, describe, expect, it } from "vitest";
import {
  countByScope,
  filteredSkills,
  scopeFilter,
  searchQuery,
  selectedSkill,
  skills,
} from "../signals";
import { makeSkill } from "./fixtures";

function reset(): void {
  skills.value = [];
  selectedSkill.value = null;
  searchQuery.value = "";
  scopeFilter.value = "all";
}

describe("skills signals", () => {
  beforeEach(reset);

  it("countByScope counts only matching scopes", () => {
    skills.value = [
      makeSkill({ id: "1", scope: "project" }),
      makeSkill({ id: "2", scope: "global" }),
      makeSkill({ id: "3", scope: "global" }),
    ];
    expect(countByScope("project")).toBe(1);
    expect(countByScope("global")).toBe(2);
    expect(countByScope("plugin")).toBe(0);
  });

  it("filteredSkills sorts project before global before plugin", () => {
    skills.value = [
      makeSkill({ id: "p", name: "p", scope: "plugin", pluginName: "z" }),
      makeSkill({ id: "g", name: "g", scope: "global" }),
      makeSkill({ id: "j", name: "j", scope: "project" }),
    ];
    expect(filteredSkills.value.map((s) => s.scope)).toEqual(["project", "global", "plugin"]);
  });

  it("filteredSkills narrows by scope filter", () => {
    skills.value = [
      makeSkill({ id: "a", scope: "project" }),
      makeSkill({ id: "b", scope: "global" }),
    ];
    scopeFilter.value = "global";
    expect(filteredSkills.value.map((s) => s.id)).toEqual(["b"]);
  });

  it("filteredSkills matches query against name, description, and tags", () => {
    skills.value = [
      makeSkill({ id: "1", name: "alpha", description: "", tags: [] }),
      makeSkill({ id: "2", name: "beta", description: "mentions alpha", tags: [] }),
      makeSkill({ id: "3", name: "gamma", description: "", tags: ["alpha"] }),
      makeSkill({ id: "4", name: "delta", description: "", tags: [] }),
    ];
    searchQuery.value = "alpha";
    expect(filteredSkills.value.map((s) => s.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("filteredSkills groups plugin skills by plugin name within plugin scope", () => {
    skills.value = [
      makeSkill({ id: "1", name: "b", scope: "plugin", pluginName: "zebra" }),
      makeSkill({ id: "2", name: "a", scope: "plugin", pluginName: "apple" }),
    ];
    expect(filteredSkills.value.map((s) => s.pluginName)).toEqual(["apple", "zebra"]);
  });
});
