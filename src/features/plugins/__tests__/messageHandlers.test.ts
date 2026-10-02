import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { handlePluginsMessage } from "../messageHandlers";
import type { PluginsHostContext } from "../messageHandlers";
import { parsePluginsData } from "../parser";
import type { AvailablePlugin, PluginsData } from "../types";

// Pass the real parser through; the install cases swap in a fixed snapshot so
// what the marketplaces offer does not depend on the machine running the tests.
vi.mock("../parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../parser")>();
  return { ...actual, parsePluginsData: vi.fn(actual.parsePluginsData) };
});

const CAVEMAN = "caveman@caveman";
const ROOT = path.join(os.tmpdir(), "claude-manager-plugins-handler-test");
const WORKSPACE = path.join(ROOT, "repo");

interface Harness {
  ctx: PluginsHostContext;
  posted: unknown[];
  write: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

function harness(overrides: Partial<PluginsHostContext> = {}): Harness {
  const posted: unknown[] = [];
  const write = vi.fn().mockReturnValue({ ok: true });
  const run = vi.fn();
  const ctx: PluginsHostContext = {
    getWebview: () => ({ postMessage: (m: unknown) => posted.push(m) }) as never,
    getWorkspace: () => WORKSPACE,
    writeSettingsValue: write,
    runShellCommand: run,
    ...overrides,
  };
  return { ctx, posted, write, run };
}

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

describe("handlePluginsMessage — installPlugin", () => {
  const offered = (id: string, installed = false): AvailablePlugin => {
    const at = id.lastIndexOf("@");
    return {
      id,
      name: id.slice(0, at),
      marketplace: id.slice(at + 1),
      description: "",
      category: "",
      author: "",
      homepage: "",
      installed,
    };
  };
  const snapshot = (available: AvailablePlugin[]): PluginsData => ({
    plugins: [],
    marketplaces: [],
    policy: [],
    available,
    errors: [],
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(parsePluginsData).mockReturnValue(
      snapshot([offered("swift-lsp@claude-plugins-official"), offered(CAVEMAN, true)]),
    );
  });

  it("runs Claude Code's own install command for an offered plugin", async () => {
    const { ctx, run } = harness();
    await handlePluginsMessage(
      { type: "installPlugin", id: "swift-lsp@claude-plugins-official", scope: "user" },
      ctx,
    );
    // A user install is folder-independent, so the terminal starts wherever.
    expect(run).toHaveBeenCalledWith(
      "plugin install swift-lsp",
      "claude plugin install swift-lsp@claude-plugins-official --scope user",
      undefined,
    );
  });

  it("starts a project install's terminal in the workspace it records against", async () => {
    const { ctx, run } = harness();
    await handlePluginsMessage(
      { type: "installPlugin", id: "swift-lsp@claude-plugins-official", scope: "project" },
      ctx,
    );
    expect(run).toHaveBeenCalledWith(
      "plugin install swift-lsp",
      "claude plugin install swift-lsp@claude-plugins-official --scope project",
      WORKSPACE,
    );
  });

  it("refuses an id no marketplace offers, whatever the webview sent", async () => {
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    const { ctx, run } = harness();
    await handlePluginsMessage({ type: "installPlugin", id: "evil@nowhere", scope: "user" }, ctx);
    expect(run).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("does not reinstall a plugin that is already installed", async () => {
    const info = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);
    const { ctx, run } = harness();
    await handlePluginsMessage({ type: "installPlugin", id: CAVEMAN, scope: "user" }, ctx);
    expect(run).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(`${CAVEMAN} is already installed.`);
  });

  it("needs an open folder for a project or local install", async () => {
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    const { ctx, run } = harness({ getWorkspace: () => undefined });
    await handlePluginsMessage(
      { type: "installPlugin", id: "swift-lsp@claude-plugins-official", scope: "local" },
      ctx,
    );
    expect(run).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("rejects an install at a scope the CLI does not have", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { ctx, run } = harness();
    await expect(
      handlePluginsMessage(
        { type: "installPlugin", id: "swift-lsp@claude-plugins-official", scope: "managed" },
        ctx,
      ),
    ).resolves.toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
});
