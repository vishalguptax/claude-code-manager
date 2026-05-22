import { describe, it, expect, beforeEach, vi } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  indexSession,
  pruneIndex,
  searchContent,
} from "../searchIndex";

const TMP = path.join(os.tmpdir(), ".claude-test-searchindex");

function writeJsonl(filename: string, lines: unknown[]): string {
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, filename);
  fs.writeFileSync(
    file,
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
  return file;
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  pruneIndex(new Set());
});

describe("searchIndex", () => {
  it("indexes plain user/assistant message text", () => {
    const file = writeJsonl("a.jsonl", [
      {
        message: { role: "user", content: "Please refactor the parser for speed" },
      },
      {
        message: {
          role: "assistant",
          content: "Sure — I'll start with the tokenizer.",
        },
      },
    ]);
    indexSession("s1", file);
    expect(searchContent("refactor the parser")).toEqual(["s1"]);
    expect(searchContent("tokenizer")).toEqual(["s1"]);
  });

  it("is case-insensitive", () => {
    const file = writeJsonl("b.jsonl", [
      { message: { role: "user", content: "Check Database Migration" } },
    ]);
    indexSession("s2", file);
    expect(searchContent("DATABASE")).toEqual(["s2"]);
    expect(searchContent("database migration")).toEqual(["s2"]);
  });

  it("handles array content blocks", () => {
    const file = writeJsonl("c.jsonl", [
      {
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Sure, here is the plan" },
            { type: "tool_use", name: "Bash" },
            { type: "text", text: "then we run the tests" },
          ],
        },
      },
    ]);
    indexSession("s3", file);
    expect(searchContent("plan")).toEqual(["s3"]);
    expect(searchContent("run the tests")).toEqual(["s3"]);
  });

  it("skips sidechain and file-history-snapshot entries", () => {
    const file = writeJsonl("d.jsonl", [
      {
        isSidechain: true,
        message: { role: "user", content: "ignored sidechain text" },
      },
      {
        type: "file-history-snapshot",
        message: { role: "user", content: "snapshot blob" },
      },
      {
        message: { role: "user", content: "kept content" },
      },
    ]);
    indexSession("s4", file);
    expect(searchContent("sidechain")).toEqual([]);
    expect(searchContent("snapshot")).toEqual([]);
    expect(searchContent("kept")).toEqual(["s4"]);
  });

  it("skips non-user/non-assistant roles", () => {
    const file = writeJsonl("e.jsonl", [
      { message: { role: "system", content: "system prelude" } },
      { message: { role: "tool", content: "tool log" } },
      { message: { role: "user", content: "real user text" } },
    ]);
    indexSession("s5", file);
    expect(searchContent("prelude")).toEqual([]);
    expect(searchContent("tool log")).toEqual([]);
    expect(searchContent("real user")).toEqual(["s5"]);
  });

  it("returns empty array for empty or whitespace queries", () => {
    const file = writeJsonl("f.jsonl", [
      { message: { role: "user", content: "hello world" } },
    ]);
    indexSession("s6", file);
    expect(searchContent("")).toEqual([]);
    expect(searchContent("   ")).toEqual([]);
  });

  it("tolerates missing files (no throw)", () => {
    expect(() => indexSession("missing", path.join(TMP, "does-not-exist.jsonl")))
      .not.toThrow();
    expect(searchContent("anything")).toEqual([]);
  });

  it("tolerates malformed JSON lines (partial chunks)", () => {
    fs.mkdirSync(TMP, { recursive: true });
    const file = path.join(TMP, "g.jsonl");
    fs.writeFileSync(
      file,
      `{ this is not json at all\n` +
        JSON.stringify({ message: { role: "user", content: "valid line" } }) +
        "\n",
    );
    indexSession("s7", file);
    expect(searchContent("valid line")).toEqual(["s7"]);
  });

  it("pruneIndex with an empty set drops all entries", () => {
    const file = writeJsonl("h.jsonl", [
      { message: { role: "user", content: "findme" } },
    ]);
    indexSession("s8", file);
    expect(searchContent("findme")).toEqual(["s8"]);
    pruneIndex(new Set());
    expect(searchContent("findme")).toEqual([]);
  });

  it("pruneIndex keeps active ids and drops stale ones", () => {
    const a = writeJsonl("p1.jsonl", [
      { message: { role: "user", content: "alpha" } },
    ]);
    const b = writeJsonl("p2.jsonl", [
      { message: { role: "user", content: "beta" } },
    ]);
    indexSession("A", a);
    indexSession("B", b);
    pruneIndex(new Set(["A"]));
    expect(searchContent("alpha")).toEqual(["A"]);
    expect(searchContent("beta")).toEqual([]);
  });

  it("indexSession skips re-extraction when mtime is unchanged", () => {
    const original = JSON.stringify({
      message: { role: "user", content: "old version" },
    });
    const replacement = JSON.stringify({
      message: { role: "user", content: "new vrsion" }, // same byte length
    });
    const file = path.join(TMP, "inc.jsonl");
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(file, original + "\n");

    // Pin the mtime to a known value (seconds-precision argument to
    // utimesSync sidesteps cross-platform sub-second rounding).
    const fixedSec = Math.floor(Date.now() / 1000) - 600;
    fs.utimesSync(file, fixedSec, fixedSec);

    indexSession("inc", file);
    expect(searchContent("old version")).toEqual(["inc"]);

    // Overwrite the bytes (same length so `size` stays stable), then
    // pin the mtime back to the same fixed value. Cache key unchanged
    // — indexSession must skip the re-extract.
    fs.writeFileSync(file, replacement + "\n");
    fs.utimesSync(file, fixedSec, fixedSec);

    indexSession("inc", file);
    expect(searchContent("old version")).toEqual(["inc"]);
    expect(searchContent("new vrsion")).toEqual([]);
  });

  it("indexSession re-extracts when the file mtime advances", () => {
    const file = writeJsonl("inc2.jsonl", [
      { message: { role: "user", content: "old text" } },
    ]);
    indexSession("inc2", file);
    expect(searchContent("old text")).toEqual(["inc2"]);

    // Bump mtime + content.
    fs.writeFileSync(
      file,
      JSON.stringify({ message: { role: "user", content: "new text" } }) + "\n",
    );
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(file, future, future);

    indexSession("inc2", file);
    expect(searchContent("new text")).toEqual(["inc2"]);
    expect(searchContent("old text")).toEqual([]);
  });

  it("evicts the oldest entries past the 2000-entry LRU cap", () => {
    // Insert 2500 sessions in id order. The index is LRU-capped at 2000,
    // so after the 2500th insert the oldest 500 (s0000..s0499) must be
    // evicted while the most-recent 2000 (s0500..s2499) remain.
    //
    // Eviction order depends only on insertion order, not file content,
    // so we write distinct transcripts only for the four boundary ids we
    // assert on and point every other id at one shared dummy file. That
    // keeps disk I/O to ~5 writes instead of 2500.
    const dummy = writeJsonl("lru-dummy.jsonl", [
      { message: { role: "user", content: "dummy filler content" } },
    ]);
    const boundary: Record<string, string> = {
      s0000: writeJsonl("s0000.jsonl", [
        { message: { role: "user", content: "token-s0000" } },
      ]),
      s0499: writeJsonl("s0499.jsonl", [
        { message: { role: "user", content: "token-s0499" } },
      ]),
      s0500: writeJsonl("s0500.jsonl", [
        { message: { role: "user", content: "token-s0500" } },
      ]),
      s2499: writeJsonl("s2499.jsonl", [
        { message: { role: "user", content: "token-s2499" } },
      ]),
    };
    for (let i = 0; i < 2500; i++) {
      const id = `s${String(i).padStart(4, "0")}`;
      indexSession(id, boundary[id] ?? dummy);
    }

    // The most-recent 2000 ids (s0500..s2499) survive.
    expect(searchContent("token-s2499")).toEqual(["s2499"]);
    expect(searchContent("token-s0500")).toEqual(["s0500"]);
    // The oldest 500 (s0000..s0499) were evicted — no content remains.
    expect(searchContent("token-s0000")).toEqual([]);
    expect(searchContent("token-s0499")).toEqual([]);
  });

  it("returns every matching id when multiple sessions match", () => {
    const a = writeJsonl("m1.jsonl", [
      { message: { role: "user", content: "shared keyword appears here" } },
    ]);
    const b = writeJsonl("m2.jsonl", [
      { message: { role: "user", content: "and also shared keyword in b" } },
    ]);
    const c = writeJsonl("m3.jsonl", [
      { message: { role: "user", content: "unrelated text" } },
    ]);
    indexSession("A", a);
    indexSession("B", b);
    indexSession("C", c);
    const hits = searchContent("shared keyword").sort();
    expect(hits).toEqual(["A", "B"]);
  });
});
