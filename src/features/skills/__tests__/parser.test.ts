import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Hoist temp home so profiles.ts + skills parser share it.
const { HOME, GLOBAL_SKILLS_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const home = _path.join(_os.tmpdir(), ".claude-test-skills-home");
  return {
    HOME: home,
    GLOBAL_SKILLS_DIR: _path.join(home, ".claude", "skills"),
  };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import { parseSkills } from "../parser";

function writeSkill(dir: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), body);
}

function sampleFm(name: string, desc = ""): string {
  return `---\nname: ${name}\ndescription: ${desc}\n---\nbody`;
}

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});
afterEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("parseSkills — nested discovery", () => {
  it("returns [] when skills directory doesn't exist", () => {
    expect(parseSkills()).toEqual([]);
  });

  it("discovers flat top-level skills with empty group", () => {
    writeSkill(path.join(GLOBAL_SKILLS_DIR, "lint"), sampleFm("lint"));
    writeSkill(path.join(GLOBAL_SKILLS_DIR, "review"), sampleFm("review"));
    const skills = parseSkills();
    expect(skills.map((s) => s.name).sort()).toEqual(["lint", "review"]);
    expect(skills.every((s) => s.group === "")).toBe(true);
  });

  it("recursively finds nested skills and records the folder path as `group`", () => {
    writeSkill(path.join(GLOBAL_SKILLS_DIR, "team", "lint"), sampleFm("team-lint"));
    writeSkill(
      path.join(GLOBAL_SKILLS_DIR, "team", "review"),
      sampleFm("team-review"),
    );
    writeSkill(
      path.join(GLOBAL_SKILLS_DIR, "solo", "quick"),
      sampleFm("solo-quick"),
    );
    const skills = parseSkills();
    const byName: Record<string, string> = {};
    for (const s of skills) byName[s.name] = s.group;
    expect(byName).toEqual({
      "team-lint": "team",
      "team-review": "team",
      "solo-quick": "solo",
    });
  });

  it("gives each nested skill a unique id even when leaf names collide", () => {
    writeSkill(path.join(GLOBAL_SKILLS_DIR, "a", "common"), sampleFm("common"));
    writeSkill(path.join(GLOBAL_SKILLS_DIR, "b", "common"), sampleFm("common"));
    const skills = parseSkills();
    const ids = skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("global:a/common");
    expect(ids).toContain("global:b/common");
  });

  it("does not descend into resource folders inside a skill", () => {
    // A skill folder (has SKILL.md). It also contains an `examples/`
    // subdir with its own SKILL.md — common pattern for bundled
    // fixtures. That nested SKILL.md must NOT show up as a separate
    // skill; we stop descending once we hit a valid skill.
    writeSkill(path.join(GLOBAL_SKILLS_DIR, "bundler"), sampleFm("bundler"));
    writeSkill(
      path.join(GLOBAL_SKILLS_DIR, "bundler", "examples"),
      sampleFm("should-not-appear"),
    );
    const skills = parseSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("bundler");
  });

  it("discovers skills from plugins via the manifest convention", () => {
    const pluginRoot = path.join(HOME, ".claude", "plugins", "cache", "mkt", "p", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "p" }),
    );
    writeSkill(path.join(pluginRoot, "skills", "shout"), sampleFm("shout"));

    fs.mkdirSync(path.join(HOME, ".claude", "plugins"), { recursive: true });
    fs.writeFileSync(
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        plugins: { "p@mkt": [{ scope: "user", installPath: pluginRoot }] },
      }),
    );

    const skills = parseSkills();
    const plug = skills.find((s) => s.scope === "plugin");
    expect(plug).toBeDefined();
    expect(plug?.name).toBe("shout");
    expect(plug?.pluginName).toBe("p@mkt");
    expect(plug?.id).toBe("plugin:p@mkt:shout");
  });

  it("namespaces plugin skill ids so colliding skill names don't clobber", () => {
    for (const tag of ["a", "b"]) {
      const root = path.join(HOME, ".claude", "plugins", "cache", "mkt", tag, "v1");
      fs.mkdirSync(path.join(root, ".claude-plugin"), { recursive: true });
      fs.writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), "{}");
      writeSkill(path.join(root, "skills", "lint"), sampleFm("lint"));
    }
    fs.writeFileSync(
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        plugins: {
          "a@mkt": [{ scope: "user", installPath: path.join(HOME, ".claude", "plugins", "cache", "mkt", "a", "v1") }],
          "b@mkt": [{ scope: "user", installPath: path.join(HOME, ".claude", "plugins", "cache", "mkt", "b", "v1") }],
        },
      }),
    );

    const skills = parseSkills();
    const ids = skills.filter((s) => s.scope === "plugin").map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("plugin:a@mkt:lint");
    expect(ids).toContain("plugin:b@mkt:lint");
  });

  it("mixes project + global skills with correct scope + group", () => {
    const ws = path.join(HOME, "workspace");
    writeSkill(path.join(ws, ".claude", "skills", "onboarding"), sampleFm("onboarding"));
    writeSkill(
      path.join(ws, ".claude", "skills", "team", "triage"),
      sampleFm("triage"),
    );
    writeSkill(path.join(GLOBAL_SKILLS_DIR, "global-quick"), sampleFm("global-quick"));

    const skills = parseSkills(ws);
    const lookup: Record<string, { scope: string; group: string }> = {};
    for (const s of skills) {
      lookup[s.name] = { scope: s.scope, group: s.group };
    }
    expect(lookup["onboarding"]).toEqual({ scope: "project", group: "" });
    expect(lookup["triage"]).toEqual({ scope: "project", group: "team" });
    expect(lookup["global-quick"]).toEqual({ scope: "global", group: "" });
  });
});
