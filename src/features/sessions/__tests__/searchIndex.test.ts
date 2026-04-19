import { describe, it, expect, beforeEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  indexSession,
  clearIndex,
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
  clearIndex();
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

  it("clearIndex drops all entries", () => {
    const file = writeJsonl("h.jsonl", [
      { message: { role: "user", content: "findme" } },
    ]);
    indexSession("s8", file);
    expect(searchContent("findme")).toEqual(["s8"]);
    clearIndex();
    expect(searchContent("findme")).toEqual([]);
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
