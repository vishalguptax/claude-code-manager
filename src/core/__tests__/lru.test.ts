import { describe, it, expect } from "vitest";
import { LRU } from "../lru";

describe("LRU", () => {
  it("evicts the oldest entry when over capacity", () => {
    const cache = new LRU<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("get promotes the key so it survives the next eviction", () => {
    const cache = new LRU<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("get on a missing key returns undefined", () => {
    const cache = new LRU<string, number>(2);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("set on an existing key updates value AND promotes", () => {
    const cache = new LRU<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 99);
    expect(cache.get("a")).toBe(99);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("has reports membership without promoting", () => {
    const cache = new LRU<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.has("a")).toBe(true);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("missing")).toBe(false);
  });

  it("delete removes a key and returns the boolean from Map", () => {
    const cache = new LRU<string, number>(2);
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("clear empties the cache", () => {
    const cache = new LRU<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("a")).toBe(false);
  });

  it("size reports the current entry count", () => {
    const cache = new LRU<string, number>(3);
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    expect(cache.size).toBe(1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
  });

  it("keys iterates in LRU → MRU order without promoting", () => {
    const cache = new LRU<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect([...cache.keys()]).toEqual(["a", "b", "c"]);
    // A second pass is identical — iterating must not promote.
    expect([...cache.keys()]).toEqual(["a", "b", "c"]);
  });

  it("entries iterates [key, value] pairs in LRU → MRU order", () => {
    const cache = new LRU<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // promote "a" to most-recent
    expect([...cache.entries()]).toEqual([
      ["b", 2],
      ["a", 1],
    ]);
  });

  it("evicts exactly down to capacity for a bulk insert of 2500", () => {
    const cache = new LRU<number, number>(2000);
    for (let i = 0; i < 2500; i++) cache.set(i, i);
    expect(cache.size).toBe(2000);
    // The oldest 500 keys (0..499) were evicted.
    expect(cache.has(0)).toBe(false);
    expect(cache.has(499)).toBe(false);
    expect(cache.has(500)).toBe(true);
    expect(cache.has(2499)).toBe(true);
  });
});
