import { afterEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { createEntry } from "../entry";

type MainModule = typeof import("../extension");

const slot = Symbol.for("claudeManager.claudeEnv");

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Record<symbol, unknown>)[slot];
});

describe("createEntry", () => {
  it("publishes the resolved config dir before loading the main bundle", () => {
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: (key: string) =>
        key === "environmentVariables" ? [{ name: "CLAUDE_CONFIG_DIR", value: "/work/claude" }] : undefined,
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
    const seenAtLoad: unknown[] = [];
    const activate = vi.fn();
    const entry = createEntry(() => {
      seenAtLoad.push((globalThis as Record<symbol, unknown>)[slot]);
      return { activate, deactivate: vi.fn() } as unknown as MainModule;
    });
    const context = {} as vscode.ExtensionContext;

    entry.activate(context);

    expect(seenAtLoad).toEqual([{ CLAUDE_CONFIG_DIR: "/work/claude" }]);
    expect(activate).toHaveBeenCalledWith(context);
  });

  it("does not load the main bundle until activation", () => {
    const load = vi.fn();
    createEntry(load);
    expect(load).not.toHaveBeenCalled();
  });

  it("forwards deactivate, and tolerates it before activation", () => {
    const deactivate = vi.fn();
    const entry = createEntry(() => ({ activate: vi.fn(), deactivate }) as unknown as MainModule);
    expect(() => entry.deactivate()).not.toThrow();
    entry.activate({} as vscode.ExtensionContext);
    entry.deactivate();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });
});
