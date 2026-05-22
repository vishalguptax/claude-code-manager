import { describe, expect, it, vi } from "vitest";
import { createMcpApi } from "../api";

function harness() {
  const posted: unknown[] = [];
  const api = createMcpApi((m) => posted.push(m));
  return { api, posted };
}

describe("createMcpApi", () => {
  it("posts a validated getMcpServers message", () => {
    const { api, posted } = harness();
    api.getServers();
    expect(posted).toEqual([{ type: "getMcpServers" }]);
  });

  it("posts openMcpConfig with the scope", () => {
    const { api, posted } = harness();
    api.openConfig("project");
    expect(posted).toEqual([{ type: "openMcpConfig", scope: "project" }]);
  });

  it("posts toggleMcpServer with all fields", () => {
    const { api, posted } = harness();
    api.toggle("srv", "global", true, "p@m");
    expect(posted).toEqual([
      { type: "toggleMcpServer", name: "srv", scope: "global", disabled: true, pluginName: "p@m" },
    ]);
  });

  it("posts deleteMcpServer", () => {
    const { api, posted } = harness();
    api.remove("srv", "project");
    expect(posted).toEqual([{ type: "deleteMcpServer", name: "srv", scope: "project" }]);
  });

  it("posts openUrl and newSession", () => {
    const { api, posted } = harness();
    api.openUrl("https://mcp.so");
    api.newSession();
    expect(posted).toEqual([
      { type: "openUrl", url: "https://mcp.so" },
      { type: "newSession" },
    ]);
  });

  it("throws (does not silently post) when a field is malformed", () => {
    const post = vi.fn();
    const api = createMcpApi(post);
    // Force an invalid payload past the typed surface to prove validation runs.
    expect(() =>
      (api.toggle as unknown as (...a: unknown[]) => void)("srv", "global", "nope"),
    ).toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
