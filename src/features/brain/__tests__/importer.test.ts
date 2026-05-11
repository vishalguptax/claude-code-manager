import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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
