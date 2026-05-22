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
});
