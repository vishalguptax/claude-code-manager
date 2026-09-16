import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { asPluginsMessage, handlePluginsMessage } from "../messageHandlers";
import type { PluginsHostContext } from "../messageHandlers";

const CAVEMAN = "caveman@caveman";
const ROOT = path.join(os.tmpdir(), "claude-manager-plugins-handler-test");
const WORKSPACE = path.join(ROOT, "repo");

interface Harness {
  ctx: PluginsHostContext;
  posted: unknown[];
  write: ReturnType<typeof vi.fn>;
}

function harness(overrides: Partial<PluginsHostContext> = {}): Harness {
  const posted: unknown[] = [];
  const write = vi.fn().mockReturnValue(true);
  const ctx: PluginsHostContext = {
    getWebview: () => ({ postMessage: (m: unknown) => posted.push(m) }) as never,
    getWorkspace: () => WORKSPACE,
    writeSettingsValue: write,
    ...overrides,
  };
  return { ctx, posted, write };
}

describe("asPluginsMessage", () => {
  it("defers on anything that is not a Plugins message", () => {
    expect(asPluginsMessage({ type: "getMcpServers" })).toBeUndefined();
    expect(asPluginsMessage(null)).toBeUndefined();
    expect(asPluginsMessage("getPlugins")).toBeUndefined();
    expect(asPluginsMessage({})).toBeUndefined();
  });

  it("accepts the well-formed variants", () => {
    expect(asPluginsMessage({ type: "getPlugins" })).toEqual({ type: "getPlugins" });
    expect(asPluginsMessage({ type: "copyPluginId", id: CAVEMAN })).toEqual({
      type: "copyPluginId",
      id: CAVEMAN,
    });
    expect(asPluginsMessage({ type: "openPluginSettings", scope: "local" })).toEqual({
      type: "openPluginSettings",
      scope: "local",
    });
    expect(
      asPluginsMessage({ type: "setPluginEnabled", id: CAVEMAN, enabled: false, scope: "project" }),
    ).toEqual({ type: "setPluginEnabled", id: CAVEMAN, enabled: false, scope: "project" });
  });

  it("claims but rejects a Plugins message with the wrong field types", () => {
    expect(asPluginsMessage({ type: "copyPluginId" })).toBeNull();
    expect(asPluginsMessage({ type: "openPluginDirectory", id: 7 })).toBeNull();
    expect(asPluginsMessage({ type: "openPluginSettings", scope: "elsewhere" })).toBeNull();
    expect(asPluginsMessage({ type: "setPluginEnabled", id: CAVEMAN, enabled: "yes", scope: "local" })).toBeNull();
    expect(asPluginsMessage({ type: "setPluginEnabled", id: CAVEMAN, enabled: true })).toBeNull();
  });

  it("drops extra fields rather than passing them through", () => {
    expect(asPluginsMessage({ type: "copyPluginId", id: CAVEMAN, extra: "x" })).toEqual({
      type: "copyPluginId",
      id: CAVEMAN,
    });
  });
});

describe("handlePluginsMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.join(WORKSPACE, ".claude"), { recursive: true });
  });
  afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

  it("defers a message belonging to another feature", async () => {
    const { ctx } = harness();
    await expect(handlePluginsMessage({ type: "getMcpServers" }, ctx)).resolves.toBe(false);
  });

  it("claims and rejects a malformed Plugins message without side effects", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { ctx, posted, write } = harness();
    await expect(handlePluginsMessage({ type: "copyPluginId" }, ctx)).resolves.toBe(true);
    expect(posted).toEqual([]);
    expect(write).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });

  it("answers getPlugins with a pluginsData snapshot", async () => {
    const { ctx, posted } = harness();
    await handlePluginsMessage({ type: "getPlugins" }, ctx);
    expect(posted).toHaveLength(1);
    const msg = posted[0] as { type: string; data: Record<string, unknown> };
    expect(msg.type).toBe("pluginsData");
    expect(msg.data).toHaveProperty("plugins");
    expect(msg.data).toHaveProperty("marketplaces");
    expect(msg.data).toHaveProperty("policy");
    expect(msg.data).toHaveProperty("errors");
  });

  it("handles getPlugins with no webview resolved", async () => {
    const { ctx } = harness({ getWebview: () => undefined });
    await expect(handlePluginsMessage({ type: "getPlugins" }, ctx)).resolves.toBe(true);
  });

  it("copies a plugin id to the clipboard", async () => {
    const write = vi.spyOn(vscode.env.clipboard, "writeText").mockResolvedValue(undefined);
    const { ctx } = harness();
    await handlePluginsMessage({ type: "copyPluginId", id: CAVEMAN }, ctx);
    expect(write).toHaveBeenCalledWith(CAVEMAN);
  });

  it("opens the settings file for the requested scope, not the winning one", async () => {
    const open = vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue({} as never);
    vi.spyOn(vscode.window, "showTextDocument").mockResolvedValue(undefined);
    const { ctx } = harness();
    await handlePluginsMessage({ type: "openPluginSettings", scope: "local" }, ctx);
    expect(open).toHaveBeenCalledWith(path.join(WORKSPACE, ".claude", "settings.local.json"));
  });

  it("refuses to reveal a directory for an id the host does not know", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    const { ctx } = harness();
    await handlePluginsMessage(
      { type: "openPluginDirectory", id: "../../etc/passwd@evil" },
      ctx,
    );
    expect(exec).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("writes enabledPlugins through the injected writer and re-pushes the snapshot", async () => {
    fs.writeFileSync(
      path.join(WORKSPACE, ".claude", "settings.json"),
      JSON.stringify({ enabledPlugins: { "other@m": true } }),
    );
    const { ctx, posted, write } = harness();
    await handlePluginsMessage(
      { type: "setPluginEnabled", id: CAVEMAN, enabled: true, scope: "project" },
      ctx,
    );
    expect(write).toHaveBeenCalledWith(
      "enabledPlugins",
      { "other@m": true, [CAVEMAN]: true },
      "project",
      WORKSPACE,
    );
    expect((posted[0] as { type: string }).type).toBe("pluginsData");
  });

  it("reports the toggle as read-only when no writer is wired, and pushes nothing", async () => {
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    const { ctx, posted } = harness({ writeSettingsValue: undefined });
    await handlePluginsMessage(
      { type: "setPluginEnabled", id: CAVEMAN, enabled: true, scope: "global" },
      ctx,
    );
    expect(String(error.mock.calls[0][0])).toContain("can't write settings.json yet");
    expect(posted).toEqual([]);
  });

  it("refuses to toggle at managed scope", async () => {
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    const { ctx, write } = harness();
    await handlePluginsMessage(
      { type: "setPluginEnabled", id: CAVEMAN, enabled: false, scope: "managed" },
      ctx,
    );
    expect(write).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain("organisation");
  });
});
