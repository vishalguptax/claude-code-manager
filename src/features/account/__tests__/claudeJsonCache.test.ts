import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { homeTmp } = vi.hoisted(() => {
  const _os = require("os") as typeof import("os");
  const _path = require("path") as typeof import("path");
  const _fs = require("fs") as typeof import("fs");
  const dir = _fs.mkdtempSync(_path.join(_os.tmpdir(), "cm-claudejson-"));
  return { homeTmp: dir };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => homeTmp };
});

import {
  readClaudeJsonRaw,
  readClaudeJsonParsed,
  clearClaudeJsonCache,
} from "../claudeJsonCache";

const CLAUDE_JSON = path.join(homeTmp, ".claude.json");

function write(obj: unknown): void {
  fs.writeFileSync(CLAUDE_JSON, JSON.stringify(obj));
}

beforeEach(() => {
  clearClaudeJsonCache();
  fs.rmSync(CLAUDE_JSON, { force: true });
});

afterAll(() => {
  fs.rmSync(homeTmp, { recursive: true, force: true });
});

describe("claudeJsonCache", () => {
  it("returns null for a missing file", () => {
    expect(readClaudeJsonRaw()).toBeNull();
    expect(readClaudeJsonParsed()).toBeNull();
  });

  it("reads + parses a present file", () => {
    write({ userID: "u1" });
    expect(readClaudeJsonParsed()).toEqual({ userID: "u1" });
    expect(readClaudeJsonRaw()).toBe(JSON.stringify({ userID: "u1" }));
  });

  it("parses at most once per file version (JSON.parse not re-run on cache hit)", () => {
    write({ a: 1 });
    const spy = vi.spyOn(JSON, "parse");
    readClaudeJsonParsed();
    readClaudeJsonParsed();
    readClaudeJsonParsed();
    expect(spy.mock.calls.length).toBe(1);
    spy.mockRestore();
  });

  it("re-reads after the file changes (mtime/size move)", () => {
    write({ v: 1 });
    expect(readClaudeJsonParsed()).toEqual({ v: 1 });
    // A different-sized payload guarantees a cache miss even on coarse mtime.
    write({ v: 22, extra: "grow" });
    expect(readClaudeJsonParsed()).toEqual({ v: 22, extra: "grow" });
  });

  it("returns null parsed for corrupt JSON but still yields the raw text", () => {
    fs.writeFileSync(CLAUDE_JSON, "{ not json ");
    expect(readClaudeJsonParsed()).toBeNull();
    expect(readClaudeJsonRaw()).toBe("{ not json ");
  });

  it("treats an empty file as no parsed object", () => {
    fs.writeFileSync(CLAUDE_JSON, "");
    expect(readClaudeJsonParsed()).toBeNull();
    expect(readClaudeJsonRaw()).toBe("");
  });
});
