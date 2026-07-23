import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as vscode from "vscode";

/**
 * Focused tests for reloadFeature — the single-feature live reparse the
 * config-artifact watchers call. We mock each feature parser so the test
 * asserts the wiring (parse → setX → postMessage of the right type),
 * independent of the parsers' own behaviour.
 */
vi.mock("../../skills/parser", () => ({ parseSkills: () => [{ id: "sk1" }] }));
vi.mock("../../commands/parser", () => ({ parseCommands: () => [{ name: "cmd1" }] }));
vi.mock("../../hooks/parser", () => ({
  parseHooks: () => ({ hooks: [{ name: "hk1" }], errors: [] }),
}));
vi.mock("../../mcp/parser", () => ({
  parseMcpServers: () => ({ servers: [{ name: "srv1" }], errors: [] }),
  readMcpAuthNeeds: () => ["needs-auth-server"],
}));
vi.mock("../../agents/parser", () => ({
  parseAgents: () => ({ agents: [{ name: "ag1" }], errors: [] }),
}));
vi.mock("../../../extension/workspace", () => ({ getWorkspace: () => undefined }));
// Worktree enrichment spawns git; stub it so these wiring tests stay
// deterministic and never touch child_process.
vi.mock("../worktreeEnrichment", () => ({ postWorktrees: vi.fn() }));

import { reloadFeature, type ConfigFeature } from "../providerActions";

interface Posted {
  type: string;
  data?: unknown;
}

function makeCtx() {
  const posted: Posted[] = [];
  const set: Record<string, unknown> = {};
  const ctx = {
    getWebview: () =>
      ({
        postMessage: (m: Posted) => {
          posted.push(m);
          return Promise.resolve(true);
        },
      }) as unknown as vscode.Webview,
    setSkills: (d: unknown) => (set.skills = d),
    setCommands: (d: unknown) => (set.commands = d),
    setHooks: (d: unknown) => (set.hooks = d),
    setMcpServers: (d: unknown) => (set.mcp = d),
    setAgents: (d: unknown) => (set.agents = d),
  };
  return { ctx, posted, set };
}

describe("reloadFeature", () => {
  let env: ReturnType<typeof makeCtx>;
  beforeEach(() => {
    env = makeCtx();
  });

  it.each<[ConfigFeature, string, string]>([
    ["skills", "skills", "skills"],
    ["commands", "commands", "commands"],
    ["hooks", "hooks", "hooks"],
    ["agents", "agents", "agents"],
  ])("parses, caches, and posts %s", (feature, msgType, setKey) => {
    reloadFeature(env.ctx as never, feature);
    expect(env.posted).toHaveLength(1);
    expect(env.posted[0].type).toBe(msgType);
    expect(env.set[setKey]).toBeDefined();
    expect(env.posted[0].data).toEqual(env.set[setKey]);
  });

  it("posts mcp as { servers, authNeeds } so the auth badge survives", () => {
    reloadFeature(env.ctx as never, "mcp");
    expect(env.posted).toHaveLength(1);
    expect(env.posted[0].type).toBe("mcpServers");
    expect(env.posted[0].data).toEqual({
      servers: env.set.mcp,
      authNeeds: ["needs-auth-server"],
    });
  });

  it("no-ops when the webview is gone", () => {
    const ctx = { ...env.ctx, getWebview: () => undefined };
    expect(() => reloadFeature(ctx as never, "skills")).not.toThrow();
    expect(env.posted).toEqual([]);
  });
});
