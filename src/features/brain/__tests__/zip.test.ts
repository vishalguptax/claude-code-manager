import { describe, it, expect } from "vitest";
import { writeZip, readZip } from "../zip";

describe("zip codec — write/read round trip", () => {
  it("round-trips a single text file", () => {
    const entries = [
      { path: "hello.txt", data: Buffer.from("hello world", "utf-8") },
    ];
    const zip = writeZip(entries);
    const parsed = readZip(zip);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].path).toBe("hello.txt");
    expect(parsed[0].data.toString("utf-8")).toBe("hello world");
  });

  it("round-trips multiple files with nested paths", () => {
    const entries = [
      { path: "global/CLAUDE.md", data: Buffer.from("# Memory\n", "utf-8") },
      {
        path: "global/skills/foo/SKILL.md",
        data: Buffer.from("---\nname: foo\n---\nbody", "utf-8"),
      },
      { path: "brain-manifest.json", data: Buffer.from("{}", "utf-8") },
    ];
    const zip = writeZip(entries);
    const parsed = readZip(zip);
    expect(parsed.map((e) => e.path).sort()).toEqual(
      ["brain-manifest.json", "global/CLAUDE.md", "global/skills/foo/SKILL.md"].sort(),
    );
    const skill = parsed.find((e) => e.path === "global/skills/foo/SKILL.md");
    expect(skill?.data.toString("utf-8")).toContain("name: foo");
  });

  it("preserves binary data (non-UTF8 bytes) byte-for-byte", () => {
    const data = Buffer.from([0x00, 0xff, 0x7f, 0x80, 0x01]);
    const zip = writeZip([{ path: "blob", data }]);
    const parsed = readZip(zip);
    expect(parsed[0].data.equals(data)).toBe(true);
  });

  it("handles UTF-8 paths with non-ASCII characters", () => {
    const entries = [
      { path: "skills/例/SKILL.md", data: Buffer.from("body", "utf-8") },
    ];
    const zip = writeZip(entries);
    const parsed = readZip(zip);
    expect(parsed[0].path).toBe("skills/例/SKILL.md");
  });

  it("produces archives other readers consider valid: central directory layout", () => {
    const zip = writeZip([{ path: "a.txt", data: Buffer.from("a") }]);
    // End-of-central-directory signature at the tail.
    const eocdSig = 0x06054b50;
    const sigIdx = zip.length - 22;
    expect(zip.readUInt32LE(sigIdx)).toBe(eocdSig);
    // Local file header signature at the start.
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  });

  it("throws on an unsupported compression method", () => {
    // Synthesise a minimal archive with method=8 (DEFLATE) to make
    // sure our reader rejects it rather than silently mangling data.
    // Easiest path: build a valid archive and flip the method byte.
    const zip = writeZip([{ path: "x", data: Buffer.from("x") }]);
    // Local-file-header method is at offset 8.
    zip.writeUInt16LE(8, 8);
    // Central-directory method is at localFileSize + dataSize + 10.
    // Scan forward for the central sig instead of computing offsets.
    for (let i = 0; i < zip.length - 4; i++) {
      if (zip.readUInt32LE(i) === 0x02014b50) {
        zip.writeUInt16LE(8, i + 10);
        break;
      }
    }
    expect(() => readZip(zip)).toThrow(/compression method/);
  });
});
