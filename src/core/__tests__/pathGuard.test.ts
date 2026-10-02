import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isStrictlyInside, removeEntry, samePath } from "../pathGuard";

const ROOT = path.join(os.tmpdir(), "claude-manager-pathguard-test");
const SKILLS = path.join(ROOT, "home", ".claude", "skills");
const OUTSIDE = path.join(ROOT, "outside");

beforeEach(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(SKILLS, "lint"), { recursive: true });
  fs.mkdirSync(path.join(OUTSIDE, "precious"), { recursive: true });
  fs.writeFileSync(path.join(OUTSIDE, "precious", "keep.txt"), "keep");
});
afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe("isStrictlyInside", () => {
  it("accepts an entry below the root, nested or not", () => {
    expect(isStrictlyInside(path.join(SKILLS, "lint"), SKILLS)).toBe(true);
    expect(isStrictlyInside(path.join(SKILLS, "team", "lint"), SKILLS)).toBe(true);
  });

  it("refuses the root itself and its siblings that share a prefix", () => {
    expect(isStrictlyInside(SKILLS, SKILLS)).toBe(false);
    expect(isStrictlyInside(`${SKILLS}-evil`, SKILLS)).toBe(false);
  });

  it("refuses `..` traversal out of the root", () => {
    expect(isStrictlyInside(path.join(SKILLS, "..", "..", "..", "outside"), SKILLS)).toBe(false);
    expect(isStrictlyInside(path.join(SKILLS, "lint", "..", ".."), SKILLS)).toBe(false);
  });

  it("refuses an entry reached through a symlinked parent that points outside", () => {
    fs.symlinkSync(OUTSIDE, path.join(SKILLS, "escape"));
    expect(isStrictlyInside(path.join(SKILLS, "escape", "precious"), SKILLS)).toBe(false);
  });

  it("treats a symlinked entry itself as inside — acting on it acts on the link", () => {
    fs.symlinkSync(path.join(OUTSIDE, "precious"), path.join(SKILLS, "linked"));
    expect(isStrictlyInside(path.join(SKILLS, "linked"), SKILLS)).toBe(true);
  });
});

describe("removeEntry", () => {
  it("removes a directory recursively", () => {
    removeEntry(path.join(SKILLS, "lint"));
    expect(fs.existsSync(path.join(SKILLS, "lint"))).toBe(false);
  });

  it("unlinks a symlink and leaves its target untouched", () => {
    const link = path.join(SKILLS, "linked");
    fs.symlinkSync(path.join(OUTSIDE, "precious"), link);
    removeEntry(link);
    expect(fs.existsSync(link)).toBe(false);
    expect(fs.readFileSync(path.join(OUTSIDE, "precious", "keep.txt"), "utf-8")).toBe("keep");
  });
});

describe("samePath", () => {
  it("compares resolved spellings", () => {
    expect(samePath(path.join(SKILLS, "lint"), path.join(SKILLS, "x", "..", "lint"))).toBe(true);
    expect(samePath(path.join(SKILLS, "lint"), path.join(SKILLS, "other"))).toBe(false);
  });
});
