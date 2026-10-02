import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { HOME } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { HOME: _path.join(_os.tmpdir(), ".claude-test-skills-access") };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import { deleteSkillFolder, findDeletableSkill, findSkill } from "../access";
import { clearClaudeJsonCache } from "../../../core/claudeJsonCache";

const SKILLS = path.join(HOME, ".claude", "skills");
const WS = path.join(HOME, "repo");
const OUTSIDE = path.join(HOME, "outside");
const ORG = "9fed4216-cef8-4112-a5f1-f6d81fd0cc9b";
const BUCKET = `${ORG}_37a1ad5d-577a-4eda-999e-63a49f2c7ef8`;

function writeSkill(dir: string, name: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\nbody`);
}

beforeEach(() => {
  // Tests rewrite ~/.claude.json with same-size content within one mtime tick.
  clearClaudeJsonCache();
  fs.rmSync(HOME, { recursive: true, force: true });
  fs.mkdirSync(WS, { recursive: true });
  fs.mkdirSync(path.join(OUTSIDE, "precious"), { recursive: true });
});
afterEach(() => fs.rmSync(HOME, { recursive: true, force: true }));

describe("findDeletableSkill", () => {
  it("resolves global and project skills the host parsed", () => {
    writeSkill(path.join(SKILLS, "lint"), "lint");
    writeSkill(path.join(WS, ".claude", "skills", "deploy"), "deploy");
    expect(findDeletableSkill(path.join(SKILLS, "lint"), WS)).toMatchObject({
      ok: true,
      skill: { scope: "global", name: "lint" },
    });
    expect(findDeletableSkill(path.join(WS, ".claude", "skills", "deploy"), WS)).toMatchObject({
      ok: true,
      skill: { scope: "project" },
    });
  });

  it("refuses a path that is not a parsed skill, however it is spelled", () => {
    writeSkill(path.join(SKILLS, "lint"), "lint");
    for (const p of [OUTSIDE, SKILLS, path.join(SKILLS, "lint", "..", "..", "..", "outside")]) {
      expect(findDeletableSkill(p).ok).toBe(false);
    }
  });

  it("refuses a claude.ai-synced skill", () => {
    fs.writeFileSync(
      path.join(HOME, ".claude.json"),
      JSON.stringify({ oauthAccount: { organizationUuid: ORG, accountUuid: BUCKET.split("_")[1] } }),
    );
    const bucket = path.join(SKILLS, "synced", BUCKET);
    writeSkill(path.join(bucket, "docs"), "docs");
    fs.writeFileSync(path.join(bucket, "manifest.json"), JSON.stringify({ skills: [{ name: "docs" }] }));
    expect(findSkill(path.join(bucket, "docs")).ok).toBe(true);
    const res = findDeletableSkill(path.join(bucket, "docs"));
    expect(res).toMatchObject({ ok: false });
    expect(!res.ok && res.error).toMatch(/claude\.ai/);
  });

  it("refuses a plugin's skill", () => {
    const root = path.join(HOME, ".claude", "plugins", "cache", "mkt", "p", "1.0.0");
    writeSkill(path.join(root, "skills", "x"), "x");
    fs.writeFileSync(
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({ version: 2, plugins: { "p@mkt": [{ scope: "user", installPath: root }] } }),
    );
    expect(findDeletableSkill(path.join(root, "skills", "x"))).toMatchObject({ ok: false });
  });

  it("refuses a skill reached through a symlinked folder that points outside the root", () => {
    writeSkill(path.join(OUTSIDE, "team", "secret"), "secret");
    fs.mkdirSync(SKILLS, { recursive: true });
    fs.symlinkSync(path.join(OUTSIDE, "team"), path.join(SKILLS, "team"));
    const viaLink = path.join(SKILLS, "team", "secret");
    // Claude Code loads it (the walk follows the link) — but it is not ours to rm.
    expect(findSkill(viaLink).ok).toBe(true);
    expect(findDeletableSkill(viaLink)).toMatchObject({ ok: false });
  });
});

describe("deleteSkillFolder", () => {
  it("unlinks a symlinked skill folder without touching its target", () => {
    writeSkill(path.join(OUTSIDE, "lint"), "lint");
    fs.mkdirSync(SKILLS, { recursive: true });
    fs.symlinkSync(path.join(OUTSIDE, "lint"), path.join(SKILLS, "lint"));
    const res = findDeletableSkill(path.join(SKILLS, "lint"));
    if (!res.ok) throw new Error(res.error);
    deleteSkillFolder(res.skill);
    expect(fs.existsSync(path.join(SKILLS, "lint"))).toBe(false);
    expect(fs.existsSync(path.join(OUTSIDE, "lint", "SKILL.md"))).toBe(true);
  });

  it("removes a real skill folder", () => {
    writeSkill(path.join(SKILLS, "lint"), "lint");
    const res = findDeletableSkill(path.join(SKILLS, "lint"));
    if (!res.ok) throw new Error(res.error);
    deleteSkillFolder(res.skill);
    expect(fs.existsSync(path.join(SKILLS, "lint"))).toBe(false);
  });
});
