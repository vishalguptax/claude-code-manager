/**
 * Symlink guard for transcript reads.
 *
 * ~/.claude/projects/ is not a tree we own — the CLI, sync tools and any
 * repo-scoped tooling write into it. A symlink planted there must never make
 * a reader surface the link target's bytes in the webview. Each reader has a
 * documented "unreadable file" value; a rejected symlink must produce exactly
 * that, and must not throw into the extension host.
 *
 * Real temp files and real symlinks: the fs mock does not model link
 * semantics, and this behaviour is entirely about them.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseJsonlFile, readSessionMeta, clearMetaCaches } from "../metaParser";
import { indexSession, searchContent, clearIndex } from "../searchIndex";

let tmp: string;

/** The bytes an attacker wants surfaced. No reader may return them. */
const SECRET = "SUPER_SECRET_TOKEN";

/**
 * Write a realistic transcript whose text contains SECRET, then return a
 * symlink to it under a plausible transcript name.
 */
function plantSymlinkedTranscript(): string {
  const target = path.join(tmp, "outside-the-tree.jsonl");
  fs.writeFileSync(
    target,
    [
      JSON.stringify({
        type: "user",
        gitBranch: "attacker-branch",
        userType: "external",
        message: { role: "user", content: SECRET },
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      JSON.stringify({
        type: "summary",
        summary: SECRET,
      }),
    ].join("\n") + "\n",
  );
  const link = path.join(tmp, "11111111-2222-3333-4444-555555555555.jsonl");
  fs.symlinkSync(target, link);
  return link;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csm-symlink-guard-"));
  clearMetaCaches();
  clearIndex();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  clearMetaCaches();
  clearIndex();
});

describe("parseJsonlFile", () => {
  it("still parses a regular transcript", () => {
    const file = path.join(tmp, "real.jsonl");
    fs.writeFileSync(file, '{"type":"user"}\n{"bad json\n{"type":"assistant"}\n');

    expect(parseJsonlFile(file)).toEqual([{ type: "user" }, { type: "assistant" }]);
  });

  it("returns [] for a symlinked transcript instead of the target's lines", () => {
    expect(parseJsonlFile(plantSymlinkedTranscript())).toEqual([]);
  });

  it("returns [] for a dangling symlink and for a directory", () => {
    const dangling = path.join(tmp, "dangling.jsonl");
    fs.symlinkSync(path.join(tmp, "gone.jsonl"), dangling);
    const dir = path.join(tmp, "dir.jsonl");
    fs.mkdirSync(dir);

    expect(parseJsonlFile(dangling)).toEqual([]);
    expect(parseJsonlFile(dir)).toEqual([]);
  });
});

describe("readSessionMeta", () => {
  it("still reads metadata from a regular transcript", () => {
    const file = path.join(tmp, "real.jsonl");
    fs.writeFileSync(
      file,
      JSON.stringify({
        type: "user",
        gitBranch: "main",
        userType: "external",
        message: { role: "user", content: "hello" },
      }) + "\n",
    );

    expect(readSessionMeta(file).branch).toBe("main");
  });

  it("returns empty metadata for a symlinked transcript", () => {
    const meta = readSessionMeta(plantSymlinkedTranscript());

    expect(meta).toEqual({ branch: "", entrypoint: "", rename: "", summary: "", aiTitle: "" });
    expect(JSON.stringify(meta)).not.toContain(SECRET);
  });

  it("returns empty metadata for a dangling symlink and for a directory", () => {
    const dangling = path.join(tmp, "dangling.jsonl");
    fs.symlinkSync(path.join(tmp, "gone.jsonl"), dangling);
    const dir = path.join(tmp, "dir.jsonl");
    fs.mkdirSync(dir);
    const empty = { branch: "", entrypoint: "", rename: "", summary: "", aiTitle: "" };

    expect(readSessionMeta(dangling)).toEqual(empty);
    expect(readSessionMeta(dir)).toEqual(empty);
  });
});

describe("search index content extraction", () => {
  it("still indexes a regular transcript", async () => {
    const file = path.join(tmp, "real.jsonl");
    fs.writeFileSync(
      file,
      JSON.stringify({ type: "user", message: { role: "user", content: "findable text" } }) + "\n",
    );
    indexSession("regular-session", file);

    expect(await searchContent("findable")).toEqual(["regular-session"]);
  });

  it("indexes no content from a symlinked transcript, so it never matches", async () => {
    indexSession("symlinked-session", plantSymlinkedTranscript());

    expect(await searchContent(SECRET.toLowerCase())).toEqual([]);
  });
});
