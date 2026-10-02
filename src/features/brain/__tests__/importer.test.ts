import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { HOME } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { HOME: _path.join(_os.tmpdir(), ".claude-test-brain-home") };
});

// ~/.claude.json (and the CLAUDE_DIR the global section restores into) must
// resolve inside the test's own home, never the developer's real one.
vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});
import { writeZip } from "../zip";
import { importBrain, previewConflicts, readManifest } from "../importer";

function makeZip(entries: Array<{ path: string; data: Buffer }>): Buffer {
  return writeZip(entries);
}

function manifestEntry(): { path: string; data: Buffer } {
  return {
    path: "brain-manifest.json",
    data: Buffer.from(
      JSON.stringify({
        version: 1,
        exportedAt: "2026-01-01T00:00:00Z",
        sections: ["project"],
        sourceWorkspace: "test",
        sourcePlatform: "linux",
      }),
      "utf-8",
    ),
  };
}

describe("brain importer", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes new files into a fresh workspace", () => {
    const zip = makeZip([
      manifestEntry(),
      { path: "project/.claude/skill.md", data: Buffer.from("hello") },
    ]);
    const summary = importBrain(zip, tmp, ["project"]);
    expect(summary.written).toHaveLength(1);
    expect(summary.overwritten).toHaveLength(0);
    const written = fs.readFileSync(
      path.join(tmp, ".claude", "skill.md"),
      "utf-8",
    );
    expect(written).toBe("hello");
  });

  it("overwrites existing files rather than writing .imported siblings", () => {
    const target = path.join(tmp, ".claude", "skill.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "old content");

    const zip = makeZip([
      manifestEntry(),
      { path: "project/.claude/skill.md", data: Buffer.from("new content") },
    ]);
    const summary = importBrain(zip, tmp, ["project"]);

    expect(summary.overwritten).toEqual([target]);
    expect(summary.written).toEqual([]);
    expect(fs.readFileSync(target, "utf-8")).toBe("new content");
    expect(fs.existsSync(path.join(tmp, ".claude", "skill.imported.md"))).toBe(
      false,
    );
  });

  it("treats byte-identical existing files as written, not overwritten", () => {
    const target = path.join(tmp, ".claude", "skill.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "same");

    const zip = makeZip([
      manifestEntry(),
      { path: "project/.claude/skill.md", data: Buffer.from("same") },
    ]);
    const summary = importBrain(zip, tmp, ["project"]);
    expect(summary.overwritten).toHaveLength(0);
    expect(summary.written).toEqual([target]);
  });

  it("refuses path-traversal entries", () => {
    const zip = makeZip([
      manifestEntry(),
      { path: "project/../escape.md", data: Buffer.from("nope") },
    ]);
    const summary = importBrain(zip, tmp, ["project"]);
    expect(summary.skipped.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(path.dirname(tmp), "escape.md"))).toBe(
      false,
    );
  });

  it("ignores sections the caller did not pick", () => {
    const zip = makeZip([
      manifestEntry(),
      { path: "project/.claude/a.md", data: Buffer.from("x") },
    ]);
    const summary = importBrain(zip, tmp, []);
    expect(summary.written).toEqual([]);
    expect(summary.overwritten).toEqual([]);
  });

  it("skips project entries when no workspace is supplied", () => {
    const zip = makeZip([
      manifestEntry(),
      { path: "project/.claude/a.md", data: Buffer.from("x") },
    ]);
    const summary = importBrain(zip, undefined, ["project"]);
    expect(summary.skipped).toContain("project/.claude/a.md");
  });

  it("previewConflicts lists files that will be replaced and excludes new ones", () => {
    const existing = path.join(tmp, ".claude", "old.md");
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, "old");

    const zip = makeZip([
      manifestEntry(),
      { path: "project/.claude/old.md", data: Buffer.from("incoming") },
      { path: "project/.claude/new.md", data: Buffer.from("brand new") },
    ]);
    const preview = previewConflicts(zip, tmp, ["project"]);
    expect(preview.overwrites).toEqual([existing]);
    expect(preview.mcpReplacements).toEqual([]);
  });

  it("previewConflicts skips identical files (no replacement needed)", () => {
    const target = path.join(tmp, ".claude", "x.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "same");

    const zip = makeZip([
      manifestEntry(),
      { path: "project/.claude/x.md", data: Buffer.from("same") },
    ]);
    const preview = previewConflicts(zip, tmp, ["project"]);
    expect(preview.overwrites).toEqual([]);
  });

  it("readManifest returns null for archives missing the manifest", () => {
    const zip = makeZip([
      { path: "project/foo.md", data: Buffer.from("x") },
    ]);
    expect(readManifest(zip)).toBeNull();
  });

  it("readManifest parses a valid manifest", () => {
    const zip = makeZip([manifestEntry()]);
    const m = readManifest(zip);
    expect(m?.version).toBe(1);
    expect(m?.sections).toEqual(["project"]);
  });
});

describe("brain importer — mcpServers merge into ~/.claude.json", () => {
  const claudeJson = path.join(HOME, ".claude.json");

  function mcpZip(mcpServers: Record<string, unknown>): Buffer {
    return makeZip([
      { path: "global/mcpServers.json", data: Buffer.from(JSON.stringify({ mcpServers })) },
    ]);
  }

  beforeEach(() => {
    fs.rmSync(HOME, { recursive: true, force: true });
    fs.mkdirSync(HOME, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(HOME, { recursive: true, force: true });
  });

  it("merges into the live file, keeping account, projects and onboarding state", () => {
    const live = {
      oauthAccount: { emailAddress: "a@b.c" },
      projects: { "/w": { hasTrustDialogAccepted: true, enabledMcpjsonServers: ["x"] } },
      hasCompletedOnboarding: true,
      mcpServers: { keep: { command: "k" }, swap: { command: "old" } },
    };
    fs.writeFileSync(claudeJson, JSON.stringify(live));
    const summary = importBrain(mcpZip({ swap: { command: "new" }, add: { command: "a" } }), undefined, ["global"]);
    expect(summary.mergedMcpServers).toEqual(["swap", "add"]);
    const after = JSON.parse(fs.readFileSync(claudeJson, "utf-8"));
    expect(after.oauthAccount).toEqual(live.oauthAccount);
    expect(after.projects).toEqual(live.projects);
    expect(after.hasCompletedOnboarding).toBe(true);
    expect(after.mcpServers).toEqual({ keep: { command: "k" }, swap: { command: "new" }, add: { command: "a" } });
    expect(fs.existsSync(`${claudeJson}.lock`)).toBe(false);
  });

  it("creates ~/.claude.json when it does not exist", () => {
    importBrain(mcpZip({ add: { command: "a" } }), undefined, ["global"]);
    expect(JSON.parse(fs.readFileSync(claudeJson, "utf-8"))).toEqual({ mcpServers: { add: { command: "a" } } });
  });

  it.each([
    ["empty (mid-write)", "", "is being written by Claude Code right now"],
    ["truncated", '{ "oauthAccount": { "emailAddress": ', "isn't valid JSON"],
    ["not an object", "[]", "doesn't hold a JSON object"],
  ])("refuses to merge when ~/.claude.json is %s, leaving it untouched", (_l, content, why) => {
    fs.writeFileSync(claudeJson, content);
    const summary = importBrain(mcpZip({ add: { command: "a" } }), undefined, ["global"]);
    expect(summary.warnings).toEqual([expect.stringContaining(`MCP servers were not merged: ${claudeJson} ${why}`)]);
    expect(summary.skipped).toEqual(["global/mcpServers.json"]);
    expect(summary.mergedMcpServers).toEqual([]);
    expect(fs.readFileSync(claudeJson, "utf-8")).toBe(content);
  });

  it("refuses when ~/.claude.json exists but can't be read", () => {
    fs.mkdirSync(claudeJson); // EISDIR on read
    const summary = importBrain(mcpZip({ add: { command: "a" } }), undefined, ["global"]);
    expect(summary.warnings).toEqual([expect.stringMatching(/couldn't be read/)]);
  });

  it("keeps importing the rest of the archive after a refused merge", () => {
    fs.writeFileSync(claudeJson, "");
    const zip = makeZip([
      { path: "global/agents/before.md", data: Buffer.from("before") },
      { path: "global/mcpServers.json", data: Buffer.from(JSON.stringify({ mcpServers: { a: {} } })) },
      { path: "global/agents/after.md", data: Buffer.from("after") },
    ]);
    const summary = importBrain(zip, undefined, ["global"]);
    expect(summary.written.map((p) => path.basename(p))).toEqual(["before.md", "after.md"]);
    expect(summary.skipped).toEqual(["global/mcpServers.json"]);
    expect(summary.warnings).toHaveLength(1);
    expect(fs.readFileSync(path.join(HOME, ".claude", "agents", "after.md"), "utf-8")).toBe("after");
  });

  it(
    "refuses while Claude Code holds its config lock",
    () => {
      fs.writeFileSync(claudeJson, "{}");
      fs.mkdirSync(`${claudeJson}.lock`);
      // A live holder keeps renewing; dating it ahead keeps it live through a
      // stall on a loaded machine.
      const renewed = new Date(Date.now() + 60 * 60_000);
      fs.utimesSync(`${claudeJson}.lock`, renewed, renewed);
      const summary = importBrain(mcpZip({ add: { command: "a" } }), undefined, ["global"]);
      expect(summary.warnings).toEqual([expect.stringMatching(/locked/)]);
      expect(fs.readFileSync(claudeJson, "utf-8")).toBe("{}");
    },
    15_000,
  );
});
