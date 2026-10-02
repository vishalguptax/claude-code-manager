import { describe, it, expect, afterEach, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describeReadRefusal, readJsonObjectForWrite, writeFileAtomic } from "../atomicWrite";

// realpath: on macOS os.tmpdir() is itself behind the /var → /private/var
// link, and writeFileAtomic places its temp file beside the REAL target.
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "csm-atomic-"));
const tmpOf = (p: string): string => `${p}.${process.pid}.csm-tmp`;

afterEach(() => {
  for (const name of fs.readdirSync(root)) {
    fs.rmSync(path.join(root, name), { recursive: true, force: true });
  }
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("writeFileAtomic", () => {
  it("writes the content and leaves no temp file behind", () => {
    const target = path.join(root, "write.json");
    writeFileAtomic(target, '{"ok":true}\n');
    expect(fs.readFileSync(target, "utf-8")).toBe('{"ok":true}\n');
    expect(fs.readdirSync(root)).toEqual(["write.json"]);
  });

  it("replaces an existing file's contents", () => {
    const target = path.join(root, "replace.json");
    fs.writeFileSync(target, "old");
    writeFileAtomic(target, "new");
    expect(fs.readFileSync(target, "utf-8")).toBe("new");
  });

  it.skipIf(process.platform === "win32")("follows a dangling symlink instead of detaching it", () => {
    // A dotfile link whose repo file is not checked out yet.
    fs.mkdirSync(path.join(root, "repo"));
    const link = path.join(root, "settings.json");
    fs.symlinkSync(path.join("repo", "settings.json"), link);
    writeFileAtomic(link, "{}");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(root, "repo", "settings.json"), "utf-8")).toBe("{}");
  });

  it("throws and cleans the temp file when the target dir is missing", () => {
    const target = path.join(root, "no", "where.json");
    expect(() => writeFileAtomic(target, "x")).toThrow();
    expect(fs.existsSync(tmpOf(target))).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "writes through a dotfile-manager symlink, keeping the link",
    () => {
      const real = path.join(root, "dotfiles-settings.json");
      const link = path.join(root, "settings.json");
      fs.writeFileSync(real, "old");
      fs.symlinkSync(real, link);
      writeFileAtomic(link, "new");
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(real, "utf-8")).toBe("new");
      expect(fs.existsSync(tmpOf(link))).toBe(false);
      expect(fs.existsSync(tmpOf(real))).toBe(false);
    },
  );

  it.skipIf(process.platform === "win32")("preserves the original file's mode", () => {
    const target = path.join(root, "secret.json");
    fs.writeFileSync(target, "old");
    fs.chmodSync(target, 0o600);
    writeFileAtomic(target, "new");
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });
});

/** Backdate a file's mtime past the empty-file settle window. */
function settle(f: string): void {
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(f, old, old);
}

describe("readJsonObjectForWrite", () => {
  it("returns {} with no raw text when the file does not exist", () => {
    expect(readJsonObjectForWrite(path.join(root, "absent.json"))).toEqual({
      ok: true,
      data: {},
      raw: null,
    });
  });

  it("returns the parsed object and its text", () => {
    const f = path.join(root, "ok.json");
    const raw = '{"model":"opus","permissions":{"allow":["Read"]}}';
    fs.writeFileSync(f, raw);
    expect(readJsonObjectForWrite(f)).toEqual({
      ok: true,
      data: { model: "opus", permissions: { allow: ["Read"] } },
      raw,
    });
  });

  it("refuses a freshly modified empty or whitespace file as mid-write", () => {
    const f = path.join(root, "blank.json");
    fs.writeFileSync(f, "");
    expect(readJsonObjectForWrite(f)).toEqual({ ok: false, reason: "mid-write" });
    fs.writeFileSync(f, "  \n");
    expect(readJsonObjectForWrite(f)).toEqual({ ok: false, reason: "mid-write" });
  });

  it("treats an empty file left unmodified past the settle window as {}", () => {
    // A `touch`ed file or one an editor saved blank: refusing it would block
    // every write forever.
    const f = path.join(root, "touched.json");
    fs.writeFileSync(f, " \n");
    settle(f);
    expect(readJsonObjectForWrite(f)).toEqual({ ok: true, data: {}, raw: " \n" });
  });

  it("does not let a far-future mtime pin an empty file as mid-write", () => {
    const f = path.join(root, "skewed.json");
    fs.writeFileSync(f, "");
    const future = new Date(Date.now() + 3_600_000);
    fs.utimesSync(f, future, future);
    expect(readJsonObjectForWrite(f)).toMatchObject({ ok: true, data: {} });
  });

  it("refuses a read error other than ENOENT as unreadable", () => {
    // EISDIR stands in for EACCES / EBUSY / EPERM: the path exists but
    // could not be read.
    const dir = path.join(root, "is-a-dir.json");
    fs.mkdirSync(dir);
    expect(readJsonObjectForWrite(dir)).toMatchObject({ ok: false, reason: "unreadable" });
  });

  it("refuses invalid JSON, even long settled", () => {
    const f = path.join(root, "bad.json");
    fs.writeFileSync(f, '{ "a": 1, // comment\n}');
    settle(f);
    expect(readJsonObjectForWrite(f)).toEqual({ ok: false, reason: "invalid-json" });
  });

  it("refuses JSON that is not an object", () => {
    const f = path.join(root, "array.json");
    for (const text of ["[1,2]", "null", '"text"', "3"]) {
      fs.writeFileSync(f, text);
      expect(readJsonObjectForWrite(f)).toEqual({ ok: false, reason: "not-object" });
    }
  });
});

describe("describeReadRefusal", () => {
  const f = "/home/u/.claude/settings.json";

  it("tells a mid-write file apart from a broken one", () => {
    expect(describeReadRefusal(f, { reason: "mid-write" })).toBe(
      `${f} is being written by Claude Code right now, so it was left untouched. Try again in a moment`,
    );
    expect(describeReadRefusal(f, { reason: "invalid-json" })).toBe(
      `${f} isn't valid JSON, so it was left untouched. Fix or remove it, then try again`,
    );
    expect(describeReadRefusal(f, { reason: "not-object" })).toBe(
      `${f} doesn't hold a JSON object, so it was left untouched. Fix or remove it, then try again`,
    );
  });

  it("carries the read error's detail", () => {
    expect(describeReadRefusal(f, { reason: "unreadable", detail: "EACCES: permission denied" })).toBe(
      `${f} couldn't be read (EACCES: permission denied), so it was left untouched`,
    );
  });
});
