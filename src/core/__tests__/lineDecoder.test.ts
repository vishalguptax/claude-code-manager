import { describe, expect, it } from "vitest";
import { createLineDecoder } from "../lineDecoder";

/**
 * Feed `data` through the decoder in fixed-size byte chunks, exactly as
 * the transcript readers do, and return every line it produced.
 */
function decodeInChunks(data: Buffer, chunkSize: number): string[] {
  const dec = createLineDecoder();
  const out: string[] = [];
  for (let pos = 0; pos < data.length; pos += chunkSize) {
    const slice = data.subarray(pos, pos + chunkSize);
    out.push(...dec.push(slice, slice.length));
  }
  const rest = dec.end();
  if (rest) out.push(rest);
  return out;
}

describe("createLineDecoder", () => {
  it("splits complete lines and carries the partial one across chunks", () => {
    const data = Buffer.from("alpha\nbeta\ngamma\n", "utf-8");
    expect(decodeInChunks(data, 4)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("returns a final line that has no trailing newline", () => {
    const data = Buffer.from("alpha\nbeta", "utf-8");
    expect(decodeInChunks(data, 3)).toEqual(["alpha", "beta"]);
  });

  it("yields nothing for empty input", () => {
    expect(decodeInChunks(Buffer.alloc(0), 8)).toEqual([]);
  });

  it("preserves empty lines between content", () => {
    const data = Buffer.from("a\n\nb\n", "utf-8");
    expect(decodeInChunks(data, 2)).toEqual(["a", "", "b"]);
  });

  describe("multi-byte boundaries — the bug this exists for", () => {
    it("does not corrupt a 3-byte character split across a chunk boundary", () => {
      // 你 is E4 BD A0. A 1-byte chunk size splits every one of them.
      const data = Buffer.from("你好\n", "utf-8");
      const lines = decodeInChunks(data, 1);
      expect(lines).toEqual(["你好"]);
      expect(lines.join("")).not.toContain("�");
    });

    it("does not corrupt a 4-byte emoji split across a chunk boundary", () => {
      const data = Buffer.from("ok 😀 done\n", "utf-8");
      for (const size of [1, 2, 3, 4, 5]) {
        expect(decodeInChunks(data, size)).toEqual(["ok 😀 done"]);
      }
    });

    it("survives a character straddling a realistic 64 KB read boundary", () => {
      // The production shape: the reader's chunk is 64 KB, and the
      // character starts at byte 65535 so its first byte is the last of
      // chunk one. Decoding each chunk independently turned this single
      // character into three U+FFFD.
      const CHUNK = 64 * 1024;
      const pad = "x".repeat(CHUNK - 1);
      const data = Buffer.from(`${pad}你好😀\n`, "utf-8");
      expect(Buffer.byteLength(pad, "utf-8")).toBe(CHUNK - 1);
      const lines = decodeInChunks(data, CHUNK);
      expect(lines).toEqual([`${pad}你好😀`]);
      expect(lines[0]).not.toContain("�");
    });

    it("keeps JSON parseable when a string value straddles the boundary", () => {
      // The failure that reaches the user: the corrupted bytes land inside
      // a JSON string, so the row renders as mojibake.
      const CHUNK = 1024;
      const pad = "x".repeat(CHUNK - 8);
      const data = Buffer.from(`{"t":"${pad}你好"}\n{"t":"second"}\n`, "utf-8");
      const lines = decodeInChunks(data, CHUNK);
      expect(lines).toHaveLength(2);
      const parsed = JSON.parse(lines[0]) as { t: string };
      expect(parsed.t.endsWith("你好")).toBe(true);
      expect(parsed.t).not.toContain("�");
    });
  });

  describe("end()", () => {
    it("is empty when the input ended on a newline", () => {
      const dec = createLineDecoder();
      const buf = Buffer.from("a\n", "utf-8");
      expect(dec.push(buf, buf.length)).toEqual(["a"]);
      expect(dec.end()).toBe("");
    });

    it("flushes genuinely malformed trailing bytes rather than dropping them", () => {
      // A truncated sequence at true end-of-input is malformed, not
      // merely unfinished — surfacing it beats silently losing data.
      const dec = createLineDecoder();
      const buf = Buffer.from([0xe4, 0xbd]); // first two bytes of 你
      expect(dec.push(buf, buf.length)).toEqual([]);
      expect(dec.end()).toBe("�");
    });

    it("can be called after a decoder that produced nothing", () => {
      expect(createLineDecoder().end()).toBe("");
    });
  });

  it("honours bytesRead rather than the buffer's full capacity", () => {
    // The readers reuse one 64 KB buffer, so a short read leaves stale
    // bytes beyond bytesRead that must not be decoded.
    const dec = createLineDecoder();
    const buf = Buffer.alloc(32, 0x41); // "AAAA…"
    buf.write("hi\n", 0, "utf-8");
    expect(dec.push(buf, 3)).toEqual(["hi"]);
    expect(dec.end()).toBe("");
  });
});
