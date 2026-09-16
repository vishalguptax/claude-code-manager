/**
 * Contract tests for the memory parser.
 *
 * Fixtures mirror the real store on disk (35 files across 5 projects,
 * surveyed before this feature was written): quoted and bare descriptions,
 * `metadata:` written with a trailing space, `node_type`/`originSessionId` on
 * every file and `modified` on most, a filename whose stem differs from its
 * `name:` slug, a genuine self-link, and genuinely broken link targets.
 *
 * Tests write real files into a temp root rather than mocking `fs`: the
 * parser's job IS filesystem shape, and the symlink and traversal cases
 * cannot be exercised against a mock.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { PROJECTS_DIR, SETTINGS_FILE, ROOT } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-memory");
  return {
    ROOT: root,
    PROJECTS_DIR: _path.join(root, "projects"),
    SETTINGS_FILE: _path.join(root, "settings.json"),
  };
});

vi.mock("../../../core/config", () => ({ PROJECTS_DIR, SETTINGS_FILE }));

import {
  buildExcerpt,
  buildProject,
  decodeProjectLabel,
  extractLinks,
  isMemoryFileName,
  isSafeSegment,
  loadMemoryStore,
  memoryDirFor,
  memoryPathFor,
  memoryRoot,
  parseFrontmatter,
  parseMemoryIndex,
  readHead,
  readMemorySettings,
  resolveGraph,
} from "../parser";

const PROJECT = "-Users-me-code-demo";

function setup(): void {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

/** Absolute path of a project's memory directory in the temp root. */
function memDir(slug = PROJECT): string {
  return path.join(PROJECTS_DIR, slug, "memory");
}

/** Write a file into a project's memory directory. */
function writeMemory(fileName: string, contents: string, slug = PROJECT): string {
  const dir = memDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, fileName);
  fs.writeFileSync(file, contents);
  return file;
}

/** A well-formed memory, shaped exactly like the real ones. */
function memory(
  name: string,
  opts: { type?: string; body?: string; quoted?: boolean; modified?: string } = {},
): string {
  const description = opts.quoted
    ? `"Summary for ${name}: with a colon"`
    : `Summary for ${name}`;
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    // Trailing space after `metadata:` — exactly what Claude Code writes.
    "metadata: ",
    "  node_type: memory",
    `  type: ${opts.type ?? "feedback"}`,
    "  originSessionId: e66c2065-3a32-4197-ba38-b46852bbd3b0",
    ...(opts.modified === undefined ? [] : [`  modified: ${opts.modified}`]),
    "---",
    "",
    opts.body ?? `Body of ${name}.`,
    "",
  ].join("\n");
}

beforeEach(setup);

describe("path grammars", () => {
  it("accepts the real project slug and filename shapes", () => {
    expect(isSafeSegment("-Users-vishal-WORK-Personal-2026-claude-code-manager")).toBe(true);
    expect(isMemoryFileName("feedback_no_workarounds.md")).toBe(true);
    expect(isMemoryFileName("ble-advert-name-not-device-type.md")).toBe(true);
  });

  it("rejects every traversal shape", () => {
    for (const bad of ["..", "../x", "a/../b", "a/b", "a\\b", "", ".."]) {
      expect(isSafeSegment(bad)).toBe(false);
      expect(isMemoryFileName(`${bad}.md`)).toBe(false);
    }
  });

  it("excludes the index from the memory filenames", () => {
    expect(isMemoryFileName("MEMORY.md")).toBe(false);
    expect(isMemoryFileName("notes.txt")).toBe(false);
  });

  it("refuses to build a path from a traversing slug or filename", () => {
    expect(memoryDirFor("../../etc", PROJECTS_DIR)).toBeNull();
    expect(memoryPathFor(PROJECT, "../../../.ssh/id_rsa", PROJECTS_DIR)).toBeNull();
    expect(memoryPathFor("..", "a.md", PROJECTS_DIR)).toBeNull();
  });

  it("keeps a valid pair inside the memory directory", () => {
    const resolved = memoryPathFor(PROJECT, "a.md", PROJECTS_DIR);
    expect(resolved).toBe(path.join(PROJECTS_DIR, PROJECT, "memory", "a.md"));
  });
});

describe("parseFrontmatter", () => {
  it("reads every field Claude Code writes", () => {
    const { meta, body, hasFrontmatter } = parseFrontmatter(
      memory("check-siblings", { modified: "2026-08-05T12:00:40.877Z" }),
    );
    expect(hasFrontmatter).toBe(true);
    expect(meta).toEqual({
      name: "check-siblings",
      description: "Summary for check-siblings",
      type: "feedback",
      nodeType: "memory",
      originSessionId: "e66c2065-3a32-4197-ba38-b46852bbd3b0",
      modified: "2026-08-05T12:00:40.877Z",
    });
    expect(body.trim()).toBe("Body of check-siblings.");
  });

  it("unquotes a quoted description that contains a colon", () => {
    const { meta } = parseFrontmatter(memory("quoted", { quoted: true }));
    expect(meta.description).toBe("Summary for quoted: with a colon");
  });

  it("treats a file with no frontmatter as all body", () => {
    const raw = "Just a note.\n\nNo fence at all.\n";
    const { meta, body, hasFrontmatter } = parseFrontmatter(raw);
    expect(hasFrontmatter).toBe(false);
    expect(meta.name).toBe("");
    expect(body).toBe(raw);
  });

  it("treats an unterminated fence as no frontmatter rather than half-parsing it", () => {
    const raw = "---\nname: truncated\ndescription: never closed\n";
    const { meta, hasFrontmatter, body } = parseFrontmatter(raw);
    expect(hasFrontmatter).toBe(false);
    expect(meta.name).toBe("");
    expect(body).toBe(raw);
  });

  it("skips junk lines inside a well-fenced block instead of failing", () => {
    const raw = [
      "---",
      "# a comment",
      "name: partial",
      "- a stray list item",
      "metadata:",
      "  type: project",
      "  nonsense",
      "---",
      "Body.",
    ].join("\n");
    const { meta, hasFrontmatter } = parseFrontmatter(raw);
    expect(hasFrontmatter).toBe(true);
    expect(meta.name).toBe("partial");
    expect(meta.type).toBe("project");
    expect(meta.description).toBe("");
  });

  it("ignores an indented block that is not metadata", () => {
    const raw = ["---", "other:", "  type: sneaky", "name: real", "---", "Body."].join("\n");
    expect(parseFrontmatter(raw).meta.type).toBe("");
  });

  it("tolerates CRLF and a BOM", () => {
    const raw = `﻿---\r\nname: crlf\r\nmetadata:\r\n  type: reference\r\n---\r\nBody.\r\n`;
    const { meta, hasFrontmatter } = parseFrontmatter(raw);
    expect(hasFrontmatter).toBe(true);
    expect(meta.name).toBe("crlf");
    expect(meta.type).toBe("reference");
  });
});

describe("extractLinks", () => {
  it("finds every target, deduped and in source order", () => {
    const body = "See [[b]] and [[a]], and [[b]] again.";
    expect(extractLinks(body)).toEqual(["b", "a"]);
  });

  it("ignores empty and malformed brackets", () => {
    expect(extractLinks("[[]] [[ ]] [not-a-link] [[unclosed")).toEqual([]);
  });
});

describe("buildExcerpt", () => {
  it("takes the first paragraph and collapses whitespace", () => {
    expect(buildExcerpt("\n\nFirst   line\nstill first.\n\nSecond.")).toBe(
      "First line still first.",
    );
  });

  it("caps long paragraphs with an ellipsis", () => {
    const excerpt = buildExcerpt("x".repeat(500));
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(241);
  });

  it("is empty for an empty body", () => {
    expect(buildExcerpt("\n\n  \n")).toBe("");
  });
});

describe("parseMemoryIndex", () => {
  it("parses the real index line shape", () => {
    const raw = [
      "# Memory Index",
      "",
      "- [Fix siblings too](fix-siblings-too.md) — when a bug is a shared pattern, fix all siblings",
      "- [No workarounds](feedback_no_workarounds.md) — standing bar for all code",
    ].join("\n");
    expect(parseMemoryIndex(raw)).toEqual([
      {
        title: "Fix siblings too",
        fileName: "fix-siblings-too.md",
        hook: "when a bug is a shared pattern, fix all siblings",
        resolved: false,
      },
      {
        title: "No workarounds",
        fileName: "feedback_no_workarounds.md",
        hook: "standing bar for all code",
        resolved: false,
      },
    ]);
  });

  it("accepts a line with no hook", () => {
    expect(parseMemoryIndex("- [Bare](bare.md)")[0]).toMatchObject({
      title: "Bare",
      fileName: "bare.md",
      hook: "",
    });
  });

  it("ignores headings, prose and blank lines", () => {
    expect(parseMemoryIndex("# Heading\n\nSome prose.\n")).toEqual([]);
  });
});

describe("readHead", () => {
  it("bounds the read and flags truncation", () => {
    const file = writeMemory("big.md", "y".repeat(5000));
    const head = readHead(file, 100);
    expect(head?.text.length).toBe(100);
    expect(head?.sizeBytes).toBe(5000);
    expect(head?.truncated).toBe(true);
  });

  it("returns null for a missing file", () => {
    expect(readHead(path.join(memDir(), "nope.md"))).toBeNull();
  });

  it("returns null for a symlink", () => {
    const target = writeMemory("real.md", memory("real"));
    const link = path.join(memDir(), "link.md");
    fs.symlinkSync(target, link);
    expect(readHead(link)).toBeNull();
  });
});

describe("resolveGraph", () => {
  it("resolves links by name, not by filename", () => {
    // The real store has exactly this: an underscored filename declaring a
    // kebab-case name. Resolving by filename would invent a broken link.
    writeMemory("feedback_no_workarounds.md", memory("feedback-no-workarounds"));
    writeMemory("cites.md", memory("cites", { body: "See [[feedback-no-workarounds]]." }));
    const project = buildProject(PROJECT, memDir());
    expect(project?.brokenLinks).toEqual([]);
    const cited = project?.memories.find((m) => m.fileName === "feedback_no_workarounds.md");
    expect(cited?.inboundCount).toBe(1);
  });

  it("reports an unresolvable target as a broken link", () => {
    writeMemory("a.md", memory("a", { body: "See [[gone]] and [[b]]." }));
    writeMemory("b.md", memory("b"));
    const project = buildProject(PROJECT, memDir());
    expect(project?.brokenLinks).toEqual(["gone"]);
    const a = project?.memories.find((m) => m.fileName === "a.md");
    expect(a?.links).toEqual([
      { target: "gone", resolved: false },
      { target: "b", resolved: true },
    ]);
  });

  it("does not count a self-link as an inbound reference", () => {
    // `list-remaining-after-commit.md` really does link to itself on disk.
    writeMemory("solo.md", memory("solo", { body: "See [[solo]]." }));
    const project = buildProject(PROJECT, memDir());
    const solo = project?.memories[0];
    expect(solo?.links).toEqual([{ target: "solo", resolved: true }]);
    expect(solo?.inboundCount).toBe(0);
    expect(solo?.orphan).toBe(true);
  });

  it("marks the first of two files sharing a name as the link target", () => {
    const memories = [
      { id: "p/a.md", fileName: "a.md", meta: { name: "dup" }, links: [] },
      { id: "p/b.md", fileName: "b.md", meta: { name: "dup" }, links: [] },
      {
        id: "p/c.md",
        fileName: "c.md",
        meta: { name: "c" },
        links: [{ target: "dup", resolved: false }],
      },
    ] as unknown as Parameters<typeof resolveGraph>[0];
    resolveGraph(memories, []);
    expect(memories[0].inboundCount).toBe(1);
    expect(memories[1].inboundCount).toBe(0);
  });
});

describe("orphan detection", () => {
  it("does not call an indexed but unlinked memory an orphan", () => {
    writeMemory("listed.md", memory("listed"));
    writeMemory("MEMORY.md", "- [Listed](listed.md) — the index knows about it\n");
    const project = buildProject(PROJECT, memDir());
    const listed = project?.memories[0];
    expect(listed?.indexed).toBe(true);
    expect(listed?.inboundCount).toBe(0);
    expect(listed?.orphan).toBe(false);
    expect(project?.orphanCount).toBe(0);
  });

  it("calls a memory that is neither linked nor indexed an orphan", () => {
    writeMemory("lonely.md", memory("lonely"));
    writeMemory("hub.md", memory("hub"));
    writeMemory("MEMORY.md", "- [Hub](hub.md) — indexed\n");
    const project = buildProject(PROJECT, memDir());
    expect(project?.orphanCount).toBe(1);
    expect(project?.memories.find((m) => m.fileName === "lonely.md")?.orphan).toBe(true);
  });

  it("does not call a linked but unindexed memory an orphan", () => {
    writeMemory("target.md", memory("target"));
    writeMemory("source.md", memory("source", { body: "See [[target]]." }));
    const project = buildProject(PROJECT, memDir());
    expect(project?.memories.find((m) => m.fileName === "target.md")?.orphan).toBe(false);
  });

  it("flags an index entry whose file is gone", () => {
    writeMemory("here.md", memory("here"));
    writeMemory("MEMORY.md", "- [Here](here.md) — ok\n- [Gone](gone.md) — deleted\n");
    const project = buildProject(PROJECT, memDir());
    expect(project?.index.map((e) => [e.fileName, e.resolved])).toEqual([
      ["here.md", true],
      ["gone.md", false],
    ]);
  });
});

describe("buildProject", () => {
  it("keeps a memory with an unrecognised type rather than dropping it", () => {
    writeMemory("weird.md", memory("weird", { type: "experimental-new-kind" }));
    const project = buildProject(PROJECT, memDir());
    expect(project?.memories).toHaveLength(1);
    expect(project?.memories[0].meta.type).toBe("experimental-new-kind");
  });

  it("keeps a memory with no frontmatter and names it after its file", () => {
    writeMemory("raw-note.md", "Just prose, no fence.\n");
    const project = buildProject(PROJECT, memDir());
    const note = project?.memories[0];
    expect(note?.hasFrontmatter).toBe(false);
    expect(note?.meta.name).toBe("raw-note");
    expect(note?.excerpt).toBe("Just prose, no fence.");
  });

  it("does not list MEMORY.md as a memory", () => {
    writeMemory("a.md", memory("a"));
    writeMemory("MEMORY.md", "- [A](a.md) — hook\n");
    const project = buildProject(PROJECT, memDir());
    expect(project?.memories.map((m) => m.fileName)).toEqual(["a.md"]);
    expect(project?.hasIndex).toBe(true);
  });

  it("ignores non-markdown files and subdirectories", () => {
    writeMemory("a.md", memory("a"));
    fs.writeFileSync(path.join(memDir(), "notes.txt"), "nope");
    fs.mkdirSync(path.join(memDir(), "nested"));
    expect(buildProject(PROJECT, memDir())?.memories).toHaveLength(1);
  });

  it("skips a symlinked memory file", () => {
    const target = writeMemory("real.md", memory("real"));
    fs.symlinkSync(target, path.join(memDir(), "linked.md"));
    const project = buildProject(PROJECT, memDir());
    expect(project?.memories.map((m) => m.fileName)).toEqual(["real.md"]);
  });

  it("returns null for an empty memory directory", () => {
    fs.mkdirSync(memDir(), { recursive: true });
    expect(buildProject(PROJECT, memDir())).toBeNull();
  });

  it("returns null for a missing memory directory", () => {
    expect(buildProject(PROJECT, memDir())).toBeNull();
  });

  it("returns null for a directory holding only MEMORY.md", () => {
    writeMemory("MEMORY.md", "- [Gone](gone.md) — everything was deleted\n");
    expect(buildProject(PROJECT, memDir())).toBeNull();
  });

  it("sorts memories most recently modified first", () => {
    writeMemory("old.md", memory("old"));
    writeMemory("new.md", memory("new"));
    fs.utimesSync(path.join(memDir(), "old.md"), new Date(1000), new Date(1000));
    fs.utimesSync(path.join(memDir(), "new.md"), new Date(9000), new Date(9000));
    expect(buildProject(PROJECT, memDir())?.memories.map((m) => m.fileName)).toEqual([
      "new.md",
      "old.md",
    ]);
  });
});

describe("settings", () => {
  it("defaults to enabled with no override when settings.json is missing", () => {
    expect(readMemorySettings()).toEqual({ enabled: true, directory: null });
    expect(memoryRoot()).toBe(PROJECTS_DIR);
  });

  it("defaults to enabled when settings.json is not valid JSON", () => {
    fs.writeFileSync(SETTINGS_FILE, "{ not json");
    expect(readMemorySettings()).toEqual({ enabled: true, directory: null });
  });

  it("reads autoMemoryEnabled: false", () => {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ autoMemoryEnabled: false }));
    expect(readMemorySettings().enabled).toBe(false);
  });

  it("relocates the root via autoMemoryDirectory", () => {
    const elsewhere = path.join(ROOT, "elsewhere");
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ autoMemoryDirectory: elsewhere }));
    expect(memoryRoot()).toBe(elsewhere);
  });

  it("ignores a blank autoMemoryDirectory", () => {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ autoMemoryDirectory: "   " }));
    expect(memoryRoot()).toBe(PROJECTS_DIR);
  });
});

describe("loadMemoryStore", () => {
  it("returns an empty store when the root does not exist", () => {
    fs.rmSync(PROJECTS_DIR, { recursive: true, force: true });
    const store = loadMemoryStore();
    expect(store).toEqual({ enabled: true, root: PROJECTS_DIR, projects: [] });
  });

  it("returns an empty store when auto-memory is disabled", () => {
    writeMemory("a.md", memory("a"));
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ autoMemoryEnabled: false }));
    const store = loadMemoryStore();
    expect(store.enabled).toBe(false);
    expect(store.projects).toEqual([]);
  });

  it("returns an empty store when the relocated root is missing", () => {
    writeMemory("a.md", memory("a"));
    const gone = path.join(ROOT, "moved-away");
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ autoMemoryDirectory: gone }));
    const store = loadMemoryStore();
    expect(store.enabled).toBe(true);
    expect(store.root).toBe(gone);
    expect(store.projects).toEqual([]);
  });

  it("skips projects with no memory directory and projects whose directory is empty", () => {
    writeMemory("a.md", memory("a"), "-Users-me-code-has-memories");
    fs.mkdirSync(path.join(PROJECTS_DIR, "-Users-me-code-empty", "memory"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(PROJECTS_DIR, "-Users-me-code-none"), { recursive: true });
    const store = loadMemoryStore();
    expect(store.projects.map((p) => p.slug)).toEqual(["-Users-me-code-has-memories"]);
  });

  it("carries each project's own graph, scoped to that project", () => {
    writeMemory("a.md", memory("a", { body: "See [[b]]." }), "-Users-me-code-one");
    writeMemory("b.md", memory("b"), "-Users-me-code-two");
    const store = loadMemoryStore();
    // `b` lives in another project, so the link is broken from `a`'s side:
    // Claude Code's memories never cross a project boundary.
    const one = store.projects.find((p) => p.slug === "-Users-me-code-one");
    expect(one?.brokenLinks).toEqual(["b"]);
  });
});

describe("decodeProjectLabel", () => {
  /** Build the slug Claude Code would write for an absolute path. */
  function slugFor(absolute: string): string {
    return absolute.split(path.sep).join("-");
  }

  it("recovers a folder name containing dashes", () => {
    // The lossy case the greedy walk exists for: `claude-code-manager` and
    // `claude/code/manager` produce the same slug.
    const dir = path.join(ROOT, "decode", "claude-code-manager");
    fs.mkdirSync(dir, { recursive: true });
    expect(decodeProjectLabel(slugFor(dir))).toBe("claude-code-manager");
  });

  it("recovers a plain folder name", () => {
    const dir = path.join(ROOT, "decode", "agentdeck");
    fs.mkdirSync(dir, { recursive: true });
    expect(decodeProjectLabel(slugFor(dir))).toBe("agentdeck");
  });

  it("falls back to the deepest directory that still exists", () => {
    const dir = path.join(ROOT, "decode", "kept");
    fs.mkdirSync(dir, { recursive: true });
    expect(decodeProjectLabel(`${slugFor(dir)}-deleted-child`)).toBe("kept");
  });

  it("falls back to the slug when nothing on the path exists", () => {
    const slug = "-nowhere-at-all-really";
    expect(decodeProjectLabel(slug)).toBe(slug);
  });
});
