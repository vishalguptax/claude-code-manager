import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createMtimeCache } from "../mtimeCache";

const TMP = path.join(os.tmpdir(), ".claude-test-mtime-cache");

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

function writeFile(name: string, contents: string): string {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, contents);
  return p;
}

/** Force a different mtime+size. Some filesystems coalesce same-tick writes. */
function rewriteFile(p: string, contents: string): void {
  fs.writeFileSync(p, contents);
  const future = new Date(Date.now() + 60_000);
  fs.utimesSync(p, future, future);
}

describe("createMtimeCache", () => {
  it("returns the cached value when mtime + size are unchanged", () => {
    const file = writeFile("a.txt", "hello");
    const cache = createMtimeCache<string>();
    let calls = 0;
    const compute = (p: string): string => {
      calls++;
      return fs.readFileSync(p, "utf-8") + "!";
    };

    const first = cache.get(file, compute);
    const second = cache.get(file, compute);

    expect(first).toBe("hello!");
    expect(second).toBe("hello!");
    expect(calls).toBe(1);
  });

  it("recomputes when the file's mtime changes", () => {
    const file = writeFile("b.txt", "one");
    const cache = createMtimeCache<string>();
    let calls = 0;
    const compute = (p: string): string => {
      calls++;
      return fs.readFileSync(p, "utf-8");
    };

    expect(cache.get(file, compute)).toBe("one");
    rewriteFile(file, "two");
    expect(cache.get(file, compute)).toBe("two");
    expect(calls).toBe(2);
  });

  it("recomputes every call when the file is missing (no stable key)", () => {
    const cache = createMtimeCache<string>();
    let calls = 0;
    const compute = (): string => {
      calls++;
      return "fallback";
    };

    const missing = path.join(TMP, "does-not-exist.txt");
    expect(cache.get(missing, compute)).toBe("fallback");
    expect(cache.get(missing, compute)).toBe("fallback");
    expect(calls).toBe(2);
    // Nothing got cached — the missing file has no stable key.
    expect(cache.size()).toBe(0);
  });

  it("invalidate forces a recompute on the next get", () => {
    const file = writeFile("c.txt", "value");
    const cache = createMtimeCache<string>();
    let calls = 0;
    const compute = (p: string): string => {
      calls++;
      return fs.readFileSync(p, "utf-8");
    };

    cache.get(file, compute);
    cache.invalidate(file);
    cache.get(file, compute);
    expect(calls).toBe(2);
  });

  it("clear drops every entry", () => {
    const a = writeFile("d.txt", "a");
    const b = writeFile("e.txt", "b");
    const cache = createMtimeCache<string>();
    const compute = (p: string): string => fs.readFileSync(p, "utf-8");

    cache.get(a, compute);
    cache.get(b, compute);
    expect(cache.size()).toBe(2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("size reflects the number of cached entries", () => {
    const cache = createMtimeCache<number>();
    expect(cache.size()).toBe(0);

    const a = writeFile("f.txt", "1");
    const b = writeFile("g.txt", "2");
    cache.get(a, () => 1);
    expect(cache.size()).toBe(1);
    cache.get(b, () => 2);
    expect(cache.size()).toBe(2);
    cache.invalidate(a);
    expect(cache.size()).toBe(1);
  });

  it("invalidates a stale entry when stat fails after a previous hit", () => {
    const file = writeFile("h.txt", "data");
    const cache = createMtimeCache<string>();
    let calls = 0;
    const compute = (): string => {
      calls++;
      return "computed";
    };
    cache.get(file, compute);
    expect(cache.size()).toBe(1);

    // Delete the file under us. Next get drops the stale entry and
    // recomputes uncached.
    fs.rmSync(file);
    expect(cache.get(file, compute)).toBe("computed");
    expect(cache.size()).toBe(0);
    expect(calls).toBe(2);
  });
});
