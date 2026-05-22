import { describe, expect, it } from "vitest";
import { groupSkills } from "../grouping";
import { makeSkill } from "./fixtures";

describe("groupSkills", () => {
  it("returns no buckets for an empty list", () => {
    expect(groupSkills([])).toEqual([]);
  });

  it("labels scopes Project / Global and splits top vs nested", () => {
    const buckets = groupSkills([
      makeSkill({ id: "project:a", name: "a", scope: "project" }),
      makeSkill({ id: "global:b", name: "b", scope: "global" }),
      makeSkill({ id: "global:lint", name: "lint", scope: "global", group: "team" }),
    ]);

    const project = buckets.find((b) => b.label === "Project");
    const global = buckets.find((b) => b.label === "Global");
    expect(project?.top).toHaveLength(1);
    expect(global?.top.map((s) => s.name)).toEqual(["b"]);
    expect(global?.nested).toEqual([
      { folder: "team", skills: [expect.objectContaining({ name: "lint" })] },
    ]);
  });

  it("labels plugin buckets with the qualified plugin name", () => {
    const buckets = groupSkills([
      makeSkill({ id: "plugin:cm:x", name: "x", scope: "plugin", pluginName: "caveman@cm" }),
    ]);
    expect(buckets[0]?.label).toBe("Plugin: caveman@cm");
  });

  it("falls back to 'unknown' for a plugin skill missing its name", () => {
    const buckets = groupSkills([makeSkill({ scope: "plugin", pluginName: undefined })]);
    expect(buckets[0]?.label).toBe("Plugin: unknown");
  });

  it("sorts nested folders alphabetically", () => {
    const buckets = groupSkills([
      makeSkill({ id: "g:z", name: "z", group: "zeta" }),
      makeSkill({ id: "g:a", name: "a", group: "alpha" }),
    ]);
    expect(buckets[0]?.nested.map((n) => n.folder)).toEqual(["alpha", "zeta"]);
  });
});
