import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { computeReadFlags, READ_NOFOLLOW_FLAGS, openFileNoFollow } from "../safeOpen";

/**
 * Real temp-directory fixtures throughout: symlink semantics are the whole
 * point of this module and no fs mock models them faithfully.
 */
let tmp: string;

/** Read the whole file behind an fd, then close it. */
function readAll(fd: number): string {
  try {
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 0);
    return buf.toString("utf-8");
  } finally {
    fs.closeSync(fd);
  }
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csm-safeopen-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("computeReadFlags", () => {
  it("adds O_NOFOLLOW off Windows", () => {
    const expected = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
    expect(computeReadFlags("darwin")).toBe(expected);
    expect(computeReadFlags("linux")).toBe(expected);
    expect(computeReadFlags("freebsd")).toBe(expected);
  });

  it("falls back to bare O_RDONLY on win32, where O_NOFOLLOW does not exist", () => {
    expect(computeReadFlags("win32")).toBe(fs.constants.O_RDONLY);
    expect(computeReadFlags("win32") & fs.constants.O_NOFOLLOW).toBe(0);
  });

  it("READ_NOFOLLOW_FLAGS reflects the running platform", () => {
    expect(READ_NOFOLLOW_FLAGS).toBe(computeReadFlags(process.platform));
  });
});

describe("openFileNoFollow", () => {
  it("opens a regular file and reads its contents unchanged", () => {
    const file = path.join(tmp, "session.jsonl");
    fs.writeFileSync(file, '{"type":"user"}\n');

    const fd = openFileNoFollow(file);
    expect(fd).not.toBeNull();
    expect(readAll(fd as number)).toBe('{"type":"user"}\n');
  });

  it("rejects a symlink pointing at a real file, without reading the target", () => {
    const secret = path.join(tmp, "id_rsa");
    fs.writeFileSync(secret, "PRIVATE KEY");
    const link = path.join(tmp, "transcript.jsonl");
    fs.symlinkSync(secret, link);

    expect(openFileNoFollow(link)).toBeNull();
  });

  it("rejects a symlink pointing outside the directory tree", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "csm-safeopen-outside-"));
    try {
      const target = path.join(outside, "elsewhere.txt");
      fs.writeFileSync(target, "outside the tree");
      const link = path.join(tmp, "escape.jsonl");
      fs.symlinkSync(target, link);

      expect(openFileNoFollow(link)).toBeNull();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a dangling symlink instead of throwing", () => {
    const link = path.join(tmp, "dangling.jsonl");
    fs.symlinkSync(path.join(tmp, "does-not-exist.jsonl"), link);

    expect(() => openFileNoFollow(link)).not.toThrow();
    expect(openFileNoFollow(link)).toBeNull();
  });

  it("rejects a directory where a file is expected", () => {
    const dir = path.join(tmp, "a-directory");
    fs.mkdirSync(dir);

    expect(openFileNoFollow(dir)).toBeNull();
  });

  it("rejects a missing path", () => {
    expect(openFileNoFollow(path.join(tmp, "nope.jsonl"))).toBeNull();
  });

  it("leaks no descriptor when a path is rejected", () => {
    const dir = path.join(tmp, "dir");
    fs.mkdirSync(dir);
    const link = path.join(tmp, "link.jsonl");
    fs.symlinkSync(dir, link);

    // A leaked fd per rejection would exhaust the table long before this
    // loop ends; the assertion is simply that we still open cleanly after.
    for (let i = 0; i < 2000; i++) {
      expect(openFileNoFollow(link)).toBeNull();
      expect(openFileNoFollow(dir)).toBeNull();
    }

    const file = path.join(tmp, "ok.jsonl");
    fs.writeFileSync(file, "still fine");
    const fd = openFileNoFollow(file);
    expect(fd).not.toBeNull();
    fs.closeSync(fd as number);
  });
});

describe("openFileNoFollow on the win32 flag path", () => {
  // Passing the win32 flags explicitly exercises the lstat pre-check branch
  // on any host, with no global process.platform mutation to undo.
  const WIN32_FLAGS = computeReadFlags("win32");

  it("still opens a regular file", () => {
    const file = path.join(tmp, "session.jsonl");
    fs.writeFileSync(file, "windows contents");

    const fd = openFileNoFollow(file, WIN32_FLAGS);
    expect(fd).not.toBeNull();
    expect(readAll(fd as number)).toBe("windows contents");
  });

  it("rejects a symlink via the lstat pre-check, since O_NOFOLLOW is unavailable", () => {
    const secret = path.join(tmp, "secret.txt");
    fs.writeFileSync(secret, "PRIVATE KEY");
    const link = path.join(tmp, "transcript.jsonl");
    fs.symlinkSync(secret, link);

    // Proves the pre-check is what rejects it: with bare O_RDONLY the open
    // itself would have succeeded and handed back the target's contents.
    const followed = fs.openSync(link, fs.constants.O_RDONLY);
    expect(readAll(followed)).toBe("PRIVATE KEY");

    expect(openFileNoFollow(link, WIN32_FLAGS)).toBeNull();
  });

  it("rejects a dangling symlink and a directory", () => {
    const dangling = path.join(tmp, "dangling.jsonl");
    fs.symlinkSync(path.join(tmp, "missing.jsonl"), dangling);
    const dir = path.join(tmp, "dir");
    fs.mkdirSync(dir);

    expect(openFileNoFollow(dangling, WIN32_FLAGS)).toBeNull();
    expect(openFileNoFollow(dir, WIN32_FLAGS)).toBeNull();
  });
});
