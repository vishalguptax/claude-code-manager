import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asObject, readJsonObject } from "../jsonFile";

const ROOT = path.join(os.tmpdir(), "claude-manager-jsonfile-test");

function write(file: string, contents: string): string {
  const full = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return full;
}

describe("asObject", () => {
  it("accepts a plain object and rejects arrays, null and scalars", () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
    expect(asObject([1])).toBeNull();
    expect(asObject(null)).toBeNull();
    expect(asObject("x")).toBeNull();
  });
});

describe("readJsonObject", () => {
  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
  });
  afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

  it("reads an object", () => {
    const file = write("a.json", '{"model":"opus"}');
    expect(readJsonObject(file)).toEqual({ kind: "ok", data: { model: "opus" } });
  });

  it("reports a missing file as absent, not as an error", () => {
    expect(readJsonObject(path.join(ROOT, "nope.json"))).toEqual({ kind: "absent" });
  });

  it("treats an empty or whitespace-only file as absent", () => {
    expect(readJsonObject(write("empty.json", ""))).toEqual({ kind: "absent" });
    expect(readJsonObject(write("blank.json", "  \n "))).toEqual({ kind: "absent" });
  });

  it("reports malformed JSON as invalid rather than throwing", () => {
    const res = readJsonObject(write("bad.json", '{"a":1,}'));
    expect(res.kind).toBe("invalid");
  });

  it("reports a non-object document as invalid", () => {
    expect(readJsonObject(write("arr.json", "[1,2]")).kind).toBe("invalid");
  });

  it("refuses a symlink even when its target is valid JSON", () => {
    const real = write("real.json", '{"a":1}');
    const link = path.join(ROOT, "link.json");
    fs.symlinkSync(real, link);
    expect(readJsonObject(link).kind).toBe("invalid");
  });

  it("refuses a directory", () => {
    fs.mkdirSync(path.join(ROOT, "dir.json"), { recursive: true });
    expect(readJsonObject(path.join(ROOT, "dir.json")).kind).toBe("invalid");
  });
});

