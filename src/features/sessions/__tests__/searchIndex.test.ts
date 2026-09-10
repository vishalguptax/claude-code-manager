import { describe, it, expect, beforeEach, vi } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  indexSession,
  indexedCharCount,
  pruneIndex,
  searchContent,
  clearIndex,
} from "../searchIndex";

/** Per-session index cap in searchIndex.ts. Text past it is tail-scanned. */
const MAX_CONTENT_CHARS = 2 * 1024 * 1024;

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
  it("indexes plain user/assistant message text", async () => {
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
    expect(await searchContent("refactor the parser")).toEqual(["s1"]);
    expect(await searchContent("tokenizer")).toEqual(["s1"]);
  });

  it("indexes content past the old 50 KB and 150 KB caps", async () => {
    // ~400 KB of filler precedes the keyword. The 50 KB cap stopped before it;
    // so did 150 KB, which is what made search look broken on long sessions.
    const file = writeJsonl("cap.jsonl", [
      { message: { role: "user", content: "x".repeat(400 * 1024) } },
      { message: { role: "assistant", content: "needle-past-old-cap" } },
    ]);
    indexSession("scap", file);
    expect(await searchContent("needle-past-old-cap")).toEqual(["scap"]);
  });

  it("is case-insensitive", async () => {
    const file = writeJsonl("b.jsonl", [
      { message: { role: "user", content: "Check Database Migration" } },
    ]);
    indexSession("s2", file);
    expect(await searchContent("DATABASE")).toEqual(["s2"]);
    expect(await searchContent("database migration")).toEqual(["s2"]);
  });

  it("handles array content blocks", async () => {
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
    expect(await searchContent("plan")).toEqual(["s3"]);
    expect(await searchContent("run the tests")).toEqual(["s3"]);
  });

  it("skips sidechain and file-history-snapshot entries", async () => {
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
    expect(await searchContent("sidechain")).toEqual([]);
    expect(await searchContent("snapshot")).toEqual([]);
    expect(await searchContent("kept")).toEqual(["s4"]);
  });

  it("skips non-user/non-assistant roles", async () => {
    const file = writeJsonl("e.jsonl", [
      { message: { role: "system", content: "system prelude" } },
      { message: { role: "tool", content: "tool log" } },
      { message: { role: "user", content: "real user text" } },
    ]);
    indexSession("s5", file);
    expect(await searchContent("prelude")).toEqual([]);
    expect(await searchContent("tool log")).toEqual([]);
    expect(await searchContent("real user")).toEqual(["s5"]);
  });

  it("returns empty array for empty or whitespace queries", async () => {
    const file = writeJsonl("f.jsonl", [
      { message: { role: "user", content: "hello world" } },
    ]);
    indexSession("s6", file);
    expect(await searchContent("")).toEqual([]);
    expect(await searchContent("   ")).toEqual([]);
  });

  it("tolerates missing files (no throw)", async () => {
    expect(() => indexSession("missing", path.join(TMP, "does-not-exist.jsonl")))
      .not.toThrow();
    expect(await searchContent("anything")).toEqual([]);
  });

  it("tolerates malformed JSON lines (partial chunks)", async () => {
    fs.mkdirSync(TMP, { recursive: true });
    const file = path.join(TMP, "g.jsonl");
    fs.writeFileSync(
      file,
      `{ this is not json at all\n` +
        JSON.stringify({ message: { role: "user", content: "valid line" } }) +
        "\n",
    );
    indexSession("s7", file);
    expect(await searchContent("valid line")).toEqual(["s7"]);
  });

  it("pruneIndex with an empty set drops all entries", async () => {
    const file = writeJsonl("h.jsonl", [
      { message: { role: "user", content: "findme" } },
    ]);
    indexSession("s8", file);
    expect(await searchContent("findme")).toEqual(["s8"]);
    pruneIndex(new Set());
    expect(await searchContent("findme")).toEqual([]);
  });

  it("pruneIndex keeps active ids and drops stale ones", async () => {
    const a = writeJsonl("p1.jsonl", [
      { message: { role: "user", content: "alpha" } },
    ]);
    const b = writeJsonl("p2.jsonl", [
      { message: { role: "user", content: "beta" } },
    ]);
    indexSession("A", a);
    indexSession("B", b);
    pruneIndex(new Set(["A"]));
    expect(await searchContent("alpha")).toEqual(["A"]);
    expect(await searchContent("beta")).toEqual([]);
  });

  it("indexSession skips re-extraction when mtime is unchanged", async () => {
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
    expect(await searchContent("old version")).toEqual(["inc"]);

    // Overwrite the bytes (same length so `size` stays stable), then
    // pin the mtime back to the same fixed value. Cache key unchanged
    // — indexSession must skip the re-extract.
    fs.writeFileSync(file, replacement + "\n");
    fs.utimesSync(file, fixedSec, fixedSec);

    indexSession("inc", file);
    expect(await searchContent("old version")).toEqual(["inc"]);
    expect(await searchContent("new vrsion")).toEqual([]);
  });

  it("indexSession re-extracts when the file mtime advances", async () => {
    const file = writeJsonl("inc2.jsonl", [
      { message: { role: "user", content: "old text" } },
    ]);
    indexSession("inc2", file);
    expect(await searchContent("old text")).toEqual(["inc2"]);

    // Bump mtime + content.
    fs.writeFileSync(
      file,
      JSON.stringify({ message: { role: "user", content: "new text" } }) + "\n",
    );
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(file, future, future);

    indexSession("inc2", file);
    expect(await searchContent("new text")).toEqual(["inc2"]);
    expect(await searchContent("old text")).toEqual([]);
  });

  it("evicts the oldest entries past the 2000-entry LRU cap", async () => {
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
    expect(await searchContent("token-s2499")).toEqual(["s2499"]);
    expect(await searchContent("token-s0500")).toEqual(["s0500"]);
    // The oldest 500 (s0000..s0499) were evicted — no content remains.
    expect(await searchContent("token-s0000")).toEqual([]);
    expect(await searchContent("token-s0499")).toEqual([]);
  });

  it("clearIndex drops every entry so a stale id no longer matches", async () => {
    const file = writeJsonl("clr.jsonl", [
      { message: { role: "user", content: "find me before the clear" } },
    ]);
    indexSession("clr1", file);
    expect(await searchContent("find me")).toEqual(["clr1"]);

    clearIndex();
    expect(await searchContent("find me")).toEqual([]);
  });

  it("returns every matching id when multiple sessions match", async () => {
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
    const hits = (await searchContent("shared keyword")).sort();
    expect(hits).toEqual(["A", "B"]);
  });
});

describe("searchIndex — text beyond the per-session cap", () => {
  /**
   * A session whose extractable text exceeds MAX_CONTENT_CHARS. The overflow
   * sits in the FIRST message so the un-indexed remainder starts at file
   * offset 0 — the case that a `tailOffset > 0` truncation test would miss.
   */
  function oversized(name: string, tail: unknown[]): string {
    return writeJsonl(name, [
      { message: { role: "user", content: "x".repeat(MAX_CONTENT_CHARS + 1024) } },
      ...tail,
    ]);
  }

  it("finds a keyword in the un-indexed tail via the on-demand scan", async () => {
    const file = oversized("tail.jsonl", [
      { message: { role: "assistant", content: "needle-beyond-the-cap" } },
      { message: { role: "user", content: "second-tail-needle" } },
    ]);
    indexSession("big", file);
    expect(await searchContent("needle-beyond-the-cap")).toEqual(["big"]);
    expect(await searchContent("second-tail-needle")).toEqual(["big"]);
  });

  it("does not report a false match for a token absent from the tail", async () => {
    const file = oversized("tail-miss.jsonl", [
      { message: { role: "assistant", content: "present-token" } },
    ]);
    indexSession("big2", file);
    expect(await searchContent("absent-token")).toEqual([]);
  });

  it("finds a keyword inside a tail message longer than one read chunk", async () => {
    // READ_CHUNK is 64 KB, so this message spans several reads. scanTail must
    // reassemble the line from its leftover before matching — matching each
    // raw read on its own would split the keyword and miss it.
    const NEEDLE = "needle-mid-long-message";
    const padded = `${"y".repeat(200 * 1024)}${NEEDLE}${"z".repeat(200 * 1024)}`;
    const file = oversized("tail-long.jsonl", [{ message: { role: "user", content: padded } }]);
    indexSession("big3", file);
    expect(await searchContent(NEEDLE)).toEqual(["big3"]);
  });

  it("does not match a query spanning two adjacent messages", async () => {
    // Messages are joined by "\n" both in the index and in the tail scan, so a
    // query cannot bridge them. Keeps tail results consistent with indexed ones.
    const file = oversized("tail-span.jsonl", [
      { message: { role: "user", content: "first-half" } },
      { message: { role: "assistant", content: "second-half" } },
    ]);
    indexSession("big5", file);
    expect(await searchContent("first-half second-half")).toEqual([]);
    expect(await searchContent("first-half")).toEqual(["big5"]);
  });

  it("skips the tail scan for sessions that fit the cap", async () => {
    // A small session must never touch disk during search. Deleting its file
    // after indexing proves the search answered from memory alone.
    const file = writeJsonl("small.jsonl", [
      { message: { role: "user", content: "in-memory-only" } },
    ]);
    indexSession("small", file);
    fs.rmSync(file);
    expect(await searchContent("in-memory-only")).toEqual(["small"]);
  });
});

describe("searchIndex — memory accounting", () => {
  it("tracks indexed characters and releases them on prune and clear", async () => {
    const file = writeJsonl("acct.jsonl", [
      { message: { role: "user", content: "counted content" } },
    ]);
    indexSession("acct", file);
    const after = indexedCharCount();
    expect(after).toBeGreaterThan(0);

    // Re-indexing the same id must replace, not double-count.
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(file, future, future);
    indexSession("acct", file);
    expect(indexedCharCount()).toBe(after);

    pruneIndex(new Set());
    expect(indexedCharCount()).toBe(0);

    indexSession("acct2", file);
    expect(indexedCharCount()).toBeGreaterThan(0);
    clearIndex();
    expect(indexedCharCount()).toBe(0);
  });
});
