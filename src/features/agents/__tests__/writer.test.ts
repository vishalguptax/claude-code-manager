import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { HOME } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { HOME: _path.join(_os.tmpdir(), ".claude-test-agents-writer") };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import {
  createAgent,
  deleteAgent,
  duplicateAgent,
  noProjectScopeReason,
  updateAgent,
} from "../writer";
import { parseFrontmatter } from "../../../core/frontmatter";
import type { AgentInput } from "../../../shared/protocol/messages";

const GLOBAL_DIR = path.join(HOME, ".claude", "agents");

function input(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    scope: "global",
    name: "reviewer",
    description: "reviews code",
    model: "opus",
    tools: [],
    skills: [],
    body: "You are a reviewer.",
    ...overrides,
  };
}

function read(name: string): string {
  return fs.readFileSync(path.join(GLOBAL_DIR, `${name}.md`), "utf-8");
}

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});
afterEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("createAgent", () => {
  it("writes a new agent file with frontmatter + body", () => {
    expect(createAgent(input({ tools: ["Read", "Grep"] })).ok).toBe(true);
    const fm = parseFrontmatter(read("reviewer"));
    expect(fm.fields.name).toBe("reviewer");
    expect(fm.fields.description).toBe("reviews code");
    expect(fm.fields.model).toBe("opus");
    expect(fm.fields.tools).toEqual(["Read", "Grep"]);
    expect(fm.body).toBe("You are a reviewer.");
  });

  it("omits model when it is 'inherit' (the implicit default)", () => {
    createAgent(input({ model: "inherit" }));
    expect(parseFrontmatter(read("reviewer")).fields.model).toBeUndefined();
  });

  it("rejects an invalid (non-kebab) name", () => {
    const r = createAgent(input({ name: "Bad Name" }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/lowercase/);
  });

  it("rejects a duplicate name in the same scope", () => {
    createAgent(input());
    const r = createAgent(input());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already exists/);
  });

  it("refuses a project scope with no workspace", () => {
    expect(createAgent(input({ scope: "project" })).ok).toBe(false);
  });
});

describe("updateAgent", () => {
  it("rewrites managed fields while preserving unknown frontmatter and body", () => {
    const p = path.join(GLOBAL_DIR, "reviewer.md");
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    fs.writeFileSync(
      p,
      "---\nname: reviewer\nmodel: opus\ncolor: blue\npermissionMode: acceptEdits\n---\nOld body.",
    );
    const r = updateAgent(p, input({ model: "haiku", description: "new desc", body: "New body." }));
    expect(r.ok).toBe(true);
    const fm = parseFrontmatter(read("reviewer"));
    expect(fm.fields.model).toBe("haiku");
    expect(fm.fields.description).toBe("new desc");
    expect(fm.fields.color).toBe("blue"); // preserved
    expect(fm.fields.permissionMode).toBe("acceptEdits"); // preserved
    expect(fm.body).toBe("New body.");
  });

  it("removes model from disk when set to inherit", () => {
    const p = path.join(GLOBAL_DIR, "reviewer.md");
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    fs.writeFileSync(p, "---\nname: reviewer\nmodel: opus\n---\nbody");
    updateAgent(p, input({ model: "inherit" }));
    expect(parseFrontmatter(read("reviewer")).fields.model).toBeUndefined();
  });
});

describe("deleteAgent", () => {
  it("removes the file", () => {
    createAgent(input());
    const p = path.join(GLOBAL_DIR, "reviewer.md");
    expect(fs.existsSync(p)).toBe(true);
    expect(deleteAgent(p).ok).toBe(true);
    expect(fs.existsSync(p)).toBe(false);
  });
});

describe("duplicateAgent", () => {
  it("copies to <name>-copy.md and renames the frontmatter name", () => {
    createAgent(input());
    const p = path.join(GLOBAL_DIR, "reviewer.md");
    expect(duplicateAgent(p).ok).toBe(true);
    const fm = parseFrontmatter(read("reviewer-copy"));
    expect(fm.fields.name).toBe("reviewer-copy");
  });

  it("dedupes the suffix when a copy already exists", () => {
    createAgent(input());
    const p = path.join(GLOBAL_DIR, "reviewer.md");
    duplicateAgent(p);
    duplicateAgent(p);
    expect(fs.existsSync(path.join(GLOBAL_DIR, "reviewer-copy.md"))).toBe(true);
    expect(fs.existsSync(path.join(GLOBAL_DIR, "reviewer-copy-2.md"))).toBe(true);
  });
});

describe("project scope availability", () => {
  it("names why there is no project scope without a workspace, or in the home folder", () => {
    fs.mkdirSync(HOME, { recursive: true });
    expect(noProjectScopeReason()).toMatch(/No workspace folder/);
    expect(noProjectScopeReason(HOME)).toMatch(/home folder/);
    const ws = path.join(HOME, "repo");
    fs.mkdirSync(ws, { recursive: true });
    expect(noProjectScopeReason(ws)).toBeNull();
  });

  it("refuses a project-scope create in the home folder instead of writing ~/.claude/agents", () => {
    fs.mkdirSync(HOME, { recursive: true });
    const res = createAgent(input({ scope: "project" }), HOME);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/home folder/);
    expect(fs.existsSync(path.join(GLOBAL_DIR, "reviewer.md"))).toBe(false);
  });

  it("writes a project-scope create into <workspace>/.claude/agents", () => {
    const ws = path.join(HOME, "repo");
    fs.mkdirSync(ws, { recursive: true });
    expect(createAgent(input({ scope: "project" }), ws)).toEqual({ ok: true });
    expect(fs.existsSync(path.join(ws, ".claude", "agents", "reviewer.md"))).toBe(true);
  });
});
