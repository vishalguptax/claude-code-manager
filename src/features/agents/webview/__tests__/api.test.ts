import { afterEach, describe, expect, it } from "vitest";
import { setVscodeApi } from "../../../../webview/hooks/useApi";
import { useAgentsApi } from "../api";

afterEach(() => setVscodeApi(null));

describe("useAgentsApi", () => {
  it("posts a getAgents request", () => {
    const calls: unknown[] = [];
    setVscodeApi({ postMessage: (m) => calls.push(m) });
    useAgentsApi().getAgents();
    expect(calls).toEqual([{ type: "getAgents" }]);
  });

  it("posts an openAgentFile request with the path", () => {
    const calls: unknown[] = [];
    setVscodeApi({ postMessage: (m) => calls.push(m) });
    useAgentsApi().openAgentFile("/a/x.md");
    expect(calls).toEqual([{ type: "openAgentFile", path: "/a/x.md" }]);
  });

  it("is a no-op when no host API is registered", () => {
    setVscodeApi(null);
    expect(() => useAgentsApi().getAgents()).not.toThrow();
  });
});
