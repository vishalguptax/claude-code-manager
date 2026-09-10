import { describe, it, expect } from "vitest";
import { setVscodeApi, useApi } from "../useApi";

describe("useApi", () => {
  it("forwards postMessage to the registered VS Code API", () => {
    const calls: unknown[] = [];
    setVscodeApi({ postMessage: (m) => calls.push(m) });
    const api = useApi();
    api.post({ type: "ready" });
    expect(calls).toEqual([{ type: "ready" }]);
    setVscodeApi(null);
  });

  it("is a no-op when no API is registered", () => {
    setVscodeApi(null);
    expect(() => useApi().post({ type: "ready" })).not.toThrow();
  });

  // Load-bearing: callers put `post` (and objects memoised on it) in
  // dependency arrays. A fresh identity per render re-ran mount effects
  // that re-request host data, and since the reply updates a signal the
  // render loops — which is what pinned the global busy bar on.
  it("returns a referentially stable bridge across calls", () => {
    setVscodeApi({ postMessage: () => {} });
    const first = useApi();
    const second = useApi();
    expect(second).toBe(first);
    expect(second.post).toBe(first.post);
    setVscodeApi(null);
  });

  it("still resolves a handle registered after first use", () => {
    setVscodeApi(null);
    const api = useApi();
    const calls: unknown[] = [];
    setVscodeApi({ postMessage: (m) => calls.push(m) });
    api.post({ type: "ready" });
    expect(calls).toEqual([{ type: "ready" }]);
    setVscodeApi(null);
  });
});
