import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPersisted, initPersistence, setPersisted } from "../persistence";
import type { VSCodeAPI } from "../types";

/** Fake VS Code API backed by an in-memory state object. */
function makeApi(): { api: VSCodeAPI; store: Record<string, unknown> } {
  let state: Record<string, unknown> = {};
  const store = state;
  const api: VSCodeAPI = {
    postMessage: vi.fn(),
    getState: () => state,
    setState: (s) => {
      state = s as Record<string, unknown>;
      Object.assign(store, state);
    },
  };
  return { api, store };
}

describe("persistence", () => {
  beforeEach(() => initPersistence(null as unknown as VSCodeAPI));

  it("no-ops before the bridge is wired", () => {
    expect(getPersisted("foo")).toBeUndefined();
    // setPersisted must not throw when the handle is null.
    expect(() => setPersisted("foo", 1)).not.toThrow();
  });

  it("round-trips a value once wired", () => {
    const { api } = makeApi();
    initPersistence(api);
    setPersisted("filter", "week");
    expect(getPersisted<string>("filter")).toBe("week");
  });

  it("merges keys rather than replacing the whole state", () => {
    const { api } = makeApi();
    initPersistence(api);
    setPersisted("a", 1);
    setPersisted("b", 2);
    expect(getPersisted<number>("a")).toBe(1);
    expect(getPersisted<number>("b")).toBe(2);
  });

  it("returns undefined for an unset key", () => {
    const { api } = makeApi();
    initPersistence(api);
    expect(getPersisted("missing")).toBeUndefined();
  });
});
