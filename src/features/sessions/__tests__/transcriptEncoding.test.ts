/**
 * Regression guard: transcript text must survive the readers' 64 KB chunk
 * boundary intact.
 *
 * Every streaming reader here decodes a fixed-size byte chunk and splits it
 * on newlines. Decoding each chunk independently corrupted any multi-byte
 * character that straddled the boundary — one CJK character came back as
 * three U+FFFD replacement characters, silently, in whatever the user then
 * read on screen. These tests drive the real public functions against real
 * files rather than the decoder in isolation, because the decoder passing
 * says nothing about whether the readers actually use it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseJsonlFile } from "../metaParser";

/** Matches the READ_CHUNK / CHUNK used by every transcript reader. */
const CHUNK = 64 * 1024;

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-mgr-encoding-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a JSONL file whose first line is padded so that `text` begins at
 * `startByte`, letting a test place a character exactly across a boundary.
 */
function writeStraddling(startByte: number, text: string): string {
  const prefix = '{"t":"';
  const pad = "x".repeat(startByte - Buffer.byteLength(prefix, "utf-8"));
  const file = path.join(dir, "t.jsonl");
  fs.writeFileSync(file, `${prefix}${pad}${text}"}\n{"t":"after"}\n`, "utf-8");
  return file;
}

describe("parseJsonlFile — chunk-boundary encoding", () => {
  it("keeps a 3-byte character intact when it starts on the last byte of a chunk", () => {
    // 你 is E4 BD A0: its first byte is the last of chunk one, and the two
    // continuation bytes open chunk two. This is the exact failure case.
    const file = writeStraddling(CHUNK - 1, "你好");
    const rows = parseJsonlFile<{ t: string }>(file);
    expect(rows).toHaveLength(2);
    expect(rows[0].t.endsWith("你好")).toBe(true);
    expect(rows[0].t).not.toContain("�");
  });

  it("keeps a 4-byte emoji intact across the boundary", () => {
    const file = writeStraddling(CHUNK - 2, "😀 done");
    const rows = parseJsonlFile<{ t: string }>(file);
    expect(rows[0].t.endsWith("😀 done")).toBe(true);
    expect(rows[0].t).not.toContain("�");
  });

  it("survives a character at every offset around the boundary", () => {
    // The corruption only bites at specific alignments, so sweep them
    // rather than trusting one lucky offset.
    for (const offset of [-3, -2, -1, 0, 1]) {
      const file = writeStraddling(CHUNK + offset, "→日本語←");
      const rows = parseJsonlFile<{ t: string }>(file);
      expect(rows[0].t.endsWith("→日本語←")).toBe(true);
      expect(rows[0].t).not.toContain("�");
      fs.rmSync(file);
    }
  });

  it("reads every line of a file spanning many chunks", () => {
    // Guards the loop condition as well as the decoding: `while (bytesRead
    // === CHUNK)` treated any short read as EOF, which truncates silently.
    const file = path.join(dir, "many.jsonl");
    const lines = Array.from({ length: 400 }, (_, i) => `{"i":${i},"pad":"${"y".repeat(500)}"}`);
    fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf-8");
    const rows = parseJsonlFile<{ i: number }>(file);
    expect(rows).toHaveLength(400);
    expect(rows[0].i).toBe(0);
    expect(rows[399].i).toBe(399);
  });

  it("still returns the final line when the file has no trailing newline", () => {
    const file = path.join(dir, "notrail.jsonl");
    fs.writeFileSync(file, '{"t":"one"}\n{"t":"two"}', "utf-8");
    const rows = parseJsonlFile<{ t: string }>(file);
    expect(rows.map((r) => r.t)).toEqual(["one", "two"]);
  });

  it("still skips malformed lines without losing the rest", () => {
    const file = path.join(dir, "mixed.jsonl");
    fs.writeFileSync(file, '{"t":"one"}\nnot json\n{"t":"three"}\n', "utf-8");
    const rows = parseJsonlFile<{ t: string }>(file);
    expect(rows.map((r) => r.t)).toEqual(["one", "three"]);
  });
});
