import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { writeFileAtomic } from "../atomicWrite";

const written: string[] = [];
function tmpTarget(name: string): string {
  const p = path.join(os.tmpdir(), `csm-atomic-${process.pid}-${name}`);
  written.push(p);
  return p;
}

afterEach(() => {
  for (const p of written.splice(0)) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(`${p}.csm-tmp`);
    } catch {
      /* ignore */
    }
  }
});

describe("writeFileAtomic", () => {
  it("writes the content and leaves no temp file behind", () => {
    const target = tmpTarget("write");
    writeFileAtomic(target, '{"ok":true}\n');
    expect(fs.readFileSync(target, "utf-8")).toBe('{"ok":true}\n');
    expect(fs.existsSync(`${target}.csm-tmp`)).toBe(false);
  });

  it("replaces an existing file's contents", () => {
    const target = tmpTarget("replace");
    fs.writeFileSync(target, "old");
    writeFileAtomic(target, "new");
    expect(fs.readFileSync(target, "utf-8")).toBe("new");
  });

  it("throws and cleans the temp file when the target dir is missing", () => {
    const target = path.join(os.tmpdir(), `csm-atomic-missing-${process.pid}`, "no", "where.json");
    expect(() => writeFileAtomic(target, "x")).toThrow();
    expect(fs.existsSync(`${target}.csm-tmp`)).toBe(false);
  });
});
