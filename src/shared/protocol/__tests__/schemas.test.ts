import { describe, it, expect } from "vitest";
import { parseMessage } from "../schemas";
import type { Message } from "../messages";

function roundTrip(msg: Message): void {
  const parsed = parseMessage(msg);
  expect(parsed).toEqual(msg);
}

describe("parseMessage — checkpoints", () => {
  const sessionId = "09285b5a-1542-4940-b2a8-ef73977f6fe1";

  it("accepts the webview → host checkpoint messages", () => {
    roundTrip({ type: "getCheckpointSessions" });
    roundTrip({ type: "getCheckpoints", sessionId });
    roundTrip({ type: "diffCheckpoint", sessionId, filePath: "/a/b.ts", version: 2 });
    roundTrip({ type: "restoreCheckpoint", sessionId, filePath: "/a/b.ts", version: 2 });
  });

  it("accepts the host → webview checkpoint replies", () => {
    roundTrip({ type: "checkpointSessions", data: [] });
    roundTrip({ type: "checkpoints", sessionId, data: [], orphanCount: 3 });
  });

  it("rejects a checkpoint target with a non-numeric version", () => {
    expect(() =>
      parseMessage({
        type: "diffCheckpoint",
        sessionId,
        filePath: "/a/b.ts",
        version: "2",
      }),
    ).toThrow();
  });

  it("rejects a checkpoint request with no session id", () => {
    expect(() => parseMessage({ type: "getCheckpoints" })).toThrow();
  });
});

describe("parseMessage — webview to host", () => {
  it("accepts trivial signal messages", () => {
    roundTrip({ type: "ready" });
    roundTrip({ type: "markDemoSeen" });
    roundTrip({ type: "refresh" });
    roundTrip({ type: "reloadAll" });
    roundTrip({ type: "importSession" });
    roundTrip({ type: "promptAddHook" });
    roundTrip({ type: "promptCustomModel" });
    roundTrip({ type: "restoreClaudeConfig" });
    roundTrip({ type: "fetchQuota" });
    roundTrip({ type: "promptSaveProfile" });
    roundTrip({ type: "openAccountSwitcher" });
    roundTrip({ type: "promptAddDirectory" });
    roundTrip({ type: "openExtensionSettings" });
  });

  it("accepts session messages", () => {
    roundTrip({
      type: "resumeSession",
      sessionId: "abc",
      entrypoint: "cli",
      projectPath: "/p",
    });
    roundTrip({ type: "resumeMultiple", sessionIds: ["a", "b"], projectPaths: ["/p"] });
    roundTrip({ type: "getSessionDetail", sessionId: "s", mode: "last", query: "q" });
    roundTrip({ type: "pinSession", sessionId: "s" });
    roundTrip({ type: "confirmDelete", sessionId: "s", callback: "x" });
    roundTrip({ type: "bulkPinSessions", ids: ["1"], pin: true });
    roundTrip({ type: "bulkDeleteSessions", ids: ["1"] });
    roundTrip({ type: "bulkExportSessions", ids: ["1"] });
    roundTrip({ type: "importMultipleSessions" });
    roundTrip({ type: "searchFullText", query: "needle" });
    roundTrip({ type: "promoteTempSession", sessionId: "s" });
    roundTrip({ type: "createWorktree", sessionId: "s" });
    roundTrip({ type: "archiveSession", sessionId: "s" });
    roundTrip({ type: "unarchiveSession", sessionId: "s" });
    roundTrip({ type: "archiveSessions", sessionIds: ["a", "b"] });
  });

  it("preserves every field of a userState push", () => {
    // roundTrip asserts deep equality, which is the point: valibot's
    // `object` strips undeclared keys instead of rejecting them, and the
    // bus dispatches the PARSED value. A field missing from the schema
    // therefore vanishes in transit with no error anywhere. `archived`
    // did exactly that.
    roundTrip({
      type: "userState",
      pinned: ["a"],
      deleted: ["b"],
      renames: { c: "name" },
      archived: ["d"],
    });
  });

  it("accepts the host replies the new tabs wait on", () => {
    // Regression guard. These three type-checked via messages.ts but had no
    // schema, so messageBus dropped every reply and the Prompts, Memory and
    // Plugins tabs sat on their loading skeletons forever. A variant that
    // exists in one file and not the other is invisible to the compiler.
    roundTrip({ type: "promptHistory", data: { entries: [] } });
    roundTrip({ type: "memoryStore", data: { projects: [] } });
    roundTrip({ type: "pluginsData", data: { plugins: [] } });
  });

  it("rejects archive messages carrying the wrong payload shape", () => {
    // The dispatch gate is the only thing between a malformed message and
    // a state write, so the negative case matters as much as the positive.
    expect(() => parseMessage({ type: "archiveSession" })).toThrow();
    expect(() => parseMessage({ type: "archiveSession", sessionId: 7 })).toThrow();
    expect(() => parseMessage({ type: "archiveSessions", sessionIds: "a" })).toThrow();
    expect(() => parseMessage({ type: "archiveSessions", sessionIds: [1, 2] })).toThrow();
  });

  it("accepts skills messages", () => {
    roundTrip({ type: "getSkills" });
    roundTrip({ type: "getSkillDetail", skillId: "id" });
    roundTrip({ type: "openSkillFile", skillPath: "/p" });
    roundTrip({ type: "deleteSkill", skillPath: "/p" });
  });

  it("accepts commands messages", () => {
    roundTrip({ type: "getCommands" });
    roundTrip({ type: "openCommandFile", path: "/p" });
  });

  it("accepts hooks messages", () => {
    roundTrip({ type: "getHooks" });
    roundTrip({ type: "openSettingsFile", scope: "global" });
    roundTrip({ type: "toggleHookEnabled", hook: { id: "h" } });
    roundTrip({ type: "deleteHook", hook: { id: "h" } });
    roundTrip({
      type: "updateHook",
      original: { id: "h" },
      next: { matcher: "*", command: "echo" },
    });
  });

  it("accepts mcp messages", () => {
    roundTrip({ type: "getMcpServers" });
    roundTrip({ type: "openMcpConfig", scope: "global" });
    roundTrip({ type: "openMcpConfig", scope: "global", name: "my-server" });
    roundTrip({ type: "toggleMcpServer", name: "n", scope: "global", disabled: true });
    roundTrip({ type: "deleteMcpServer", name: "n", scope: "global" });
  });

  it("accepts mcp add/edit + action messages", () => {
    roundTrip({
      type: "addMcpServer",
      server: {
        name: "api",
        scope: "project",
        transport: "http",
        url: "https://x/mcp",
        headers: { Authorization: "Bearer t" },
      },
    });
    roundTrip({
      type: "updateMcpServer",
      originalName: "api",
      server: {
        name: "api2",
        scope: "project",
        transport: "stdio",
        command: "node",
        args: ["s.js"],
        env: { K: "v" },
      },
    });
    roundTrip({ type: "authenticateMcp", name: "api" });
    roundTrip({ type: "logoutMcp", name: "api" });
    roundTrip({ type: "reconnectMcp" });
    roundTrip({ type: "mcpListStatus" });
  });

  it("accepts hook edit + panel messages", () => {
    roundTrip({ type: "openHooksPanel" });
    roundTrip({
      type: "updateHook",
      original: { any: "snapshot" },
      next: { matcher: "Edit", command: "echo", event: "PreToolUse", scope: "project", timeout: 30 },
    });
  });

  it("accepts agents messages", () => {
    roundTrip({ type: "getAgents" });
    roundTrip({ type: "openAgentFile", path: "/p" });
    const agent = {
      scope: "project",
      name: "reviewer",
      description: "reviews",
      model: "opus",
      tools: ["Read", "Grep"],
      skills: ["research"],
      body: "You are a reviewer.",
    };
    roundTrip({ type: "createAgent", agent });
    roundTrip({ type: "updateAgent", path: "/a/reviewer.md", agent });
    roundTrip({ type: "deleteAgent", path: "/a/reviewer.md" });
    roundTrip({ type: "duplicateAgent", path: "/a/reviewer.md" });
  });

  it("accepts account messages", () => {
    roundTrip({ type: "getAccountData" });
    roundTrip({ type: "launchSlash", command: "/help" });
    roundTrip({ type: "setModel", model: "opus" });
    roundTrip({ type: "setVoiceEnabled", value: true });
    roundTrip({ type: "setCommitAttribution", value: "x" });
    roundTrip({ type: "setPrAttribution", value: "x" });
    roundTrip({ type: "removePermission", scope: "global", tool: "Bash", list: "allow" });
    roundTrip({ type: "promptAddPermission", scope: "project", list: "deny" });
    roundTrip({ type: "promptRemovePermission", scope: "local", tool: "Bash", list: "deny" });
    roundTrip({ type: "resetSettings", scope: "global" });
    roundTrip({ type: "setSetting", key: "k", value: 1, scope: "global" });
    roundTrip({ type: "runCommand", command: "claudeManager.reload" });
    roundTrip({ type: "restoreSettingsSnapshot", scope: "global", snapshotId: "s1" });
    roundTrip({ type: "deleteSettingsSnapshot", scope: "global", snapshotId: "s1" });
  });
});

describe("parseMessage — host to webview", () => {
  it("accepts host messages", () => {
    roundTrip({ type: "workspacePath", data: "/p" });
    roundTrip({ type: "workspaceBranch", data: "main" });
    roundTrip({ type: "sessions", data: [], stats: { totalSessions: 0 } });
    roundTrip({ type: "sessionDetail", data: { id: "s" } });
    roundTrip({
      type: "userState",
      pinned: ["a"],
      deleted: [],
      renames: { a: "Foo" },
    });
    roundTrip({ type: "navigateList" });
    roundTrip({ type: "skills", data: [] });
    roundTrip({ type: "skillDetail", data: { id: "s" } });
    roundTrip({ type: "fullTextResults", query: "q", ids: ["a", "b"] });
    roundTrip({ type: "searchIndexReady" });
    roundTrip({ type: "error", message: "boom" });
    roundTrip({ type: "reloadComplete" });
    roundTrip({ type: "projects", data: ["/a", "/b"] });
    roundTrip({ type: "accountData", data: { email: "a@b" } });
    roundTrip({ type: "commands", data: [] });
    roundTrip({ type: "hooks", data: [] });
    roundTrip({ type: "hooks", data: [], errors: ["Failed to parse settings.json: bad"] });
    roundTrip({ type: "mcpServers", data: [] });
    roundTrip({ type: "mcpServers", data: [], errors: ["Failed to parse .mcp.json: bad"] });
    roundTrip({ type: "agents", data: [] });
    roundTrip({ type: "agents", data: [], errors: ["Failed to read agents dir: bad"] });
    roundTrip({ type: "quotaData", result: { ok: true } });
    roundTrip({ type: "terminalSessions", ids: ["a", "b"] });
    roundTrip({ type: "tempSessions", ids: ["t1", "t2"] });
    roundTrip({
      type: "worktrees",
      map: {
        s1: {
          path: "/repo/.claude/worktrees/feat",
          branch: "worktree-feat",
          kind: "claude",
          exists: true,
          locked: false,
          repoRoot: "/repo",
        },
      },
    });
    roundTrip({ type: "worktrees", map: {} });
  });

  it("accepts settings message with arbitrary extra keys", () => {
    const msg = {
      type: "settings" as const,
      defaultFilter: "recent",
      defaultProject: "current",
      restoreWindowMinutes: 30,
      claudeCodeExtensionInstalled: true,
      marketplaceSkillsUrl: "https://example",
      marketplaceMcpUrl: "https://example",
      demoSeen: false,
    };
    const parsed = parseMessage(msg);
    expect(parsed).toEqual(msg);
  });
});

describe("parseMessage — saveStatsImage", () => {
  // The handler shipped without a schema entry, so every share-card
  // export was dropped at the gate: the PNG never reached the host and
  // the webview's busy bar hung waiting for an ack that never came.
  it("accepts the share-card export payload", () => {
    const msg = { type: "saveStatsImage" as const, pngBase64: "QUJD" };
    expect(parseMessage(msg)).toEqual(msg);
  });

  it("rejects it without the payload", () => {
    expect(() => parseMessage({ type: "saveStatsImage" })).toThrow();
  });
});

describe("parseMessage — negative", () => {
  it("throws on unknown type", () => {
    expect(() => parseMessage({ type: "nonexistent" })).toThrow();
  });

  it("throws on missing required fields", () => {
    expect(() => parseMessage({ type: "resumeSession" })).toThrow();
  });

  it("throws on non-object input", () => {
    expect(() => parseMessage(null)).toThrow();
    expect(() => parseMessage("ready")).toThrow();
  });
});
