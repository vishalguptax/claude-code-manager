import { describe, it, expect } from "vitest";
import { normPath, getNonce } from "../utils";

describe("normPath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normPath("C:\\Users\\foo\\bar")).toBe("c:/users/foo/bar");
  });

  it("strips trailing slashes", () => {
    expect(normPath("/home/user/project/")).toBe("/home/user/project");
    expect(normPath("/home/user/project///")).toBe("/home/user/project");
  });

  it("lowercases the entire path", () => {
    expect(normPath("/Home/USER/Project")).toBe("/home/user/project");
  });

  it("handles empty string", () => {
    expect(normPath("")).toBe("");
  });

  it("handles mixed separators and trailing slashes", () => {
    expect(normPath("C:\\Users/foo\\bar/")).toBe("c:/users/foo/bar");
  });
});

describe("getNonce", () => {
  it("returns a 32-character string", () => {
    const nonce = getNonce();
    expect(nonce).toHaveLength(32);
  });

  it("contains only alphanumeric characters", () => {
    const nonce = getNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("produces different values on successive calls", () => {
    const a = getNonce();
    const b = getNonce();
    // Technically could collide, but 62^32 makes this astronomically unlikely
    expect(a).not.toBe(b);
  });
});
