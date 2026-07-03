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

  it("posts openMcpConfig with the server name so the host opens the owning file", () => {
    const { api, posted } = harness();
    api.openConfig("global", "my-server");
    expect(posted).toEqual([{ type: "openMcpConfig", scope: "global", name: "my-server" }]);
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

  it("posts add / update with the server payload", () => {
    const { api, posted } = harness();
    const server = {
      name: "api",
      scope: "project",
      transport: "http",
      url: "https://x/mcp",
      env: {},
      headers: {},
    };
    api.add(server);
    api.update("old-name", server);
    expect(posted).toEqual([
      { type: "addMcpServer", server },
      { type: "updateMcpServer", originalName: "old-name", server },
    ]);
  });

  it("posts the custom action messages", () => {
    const { api, posted } = harness();
    api.authenticate("api");
    api.logout("api");
    api.reconnect();
    api.checkStatus();
    expect(posted).toEqual([
      { type: "authenticateMcp", name: "api" },
      { type: "logoutMcp", name: "api" },
      { type: "reconnectMcp" },
      { type: "mcpListStatus" },
    ]);
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
