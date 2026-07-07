import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the module graph handleAccountMessage pulls in so the test exercises
// only the getAccountData dispatch + model-revalidation re-push, not real disk
// or CLI I/O. vi.hoisted runs before the hoisted vi.mock factories so the
// spies exist by the time the factories close over them.
const { revalidateModelCache, parseAccountData, postAccountData } = vi.hoisted(() => ({
  revalidateModelCache: vi.fn<[], Promise<boolean>>(),
  parseAccountData: vi.fn((_ws?: string) => ({ marker: "account" }) as unknown),
  postAccountData: vi.fn(),
}));
let workspace: string | undefined = "/ws";

vi.mock("../../account/models", () => ({ revalidateModelCache }));
vi.mock("../accountPush", () => ({ postAccountData }));
vi.mock("../../extension/workspace", () => ({ getWorkspace: () => workspace }));
vi.mock("../../account/parser", () => ({
  parseAccountData: (ws?: string) => parseAccountData(ws),
  restoreSettingsSnapshot: vi.fn(),
  deleteSettingsSnapshot: vi.fn(),
}));
vi.mock("../../account/quota", () => ({ readQuota: () => null }));
vi.mock("../../account/statuslineInstall", () => ({
  installStatusline: vi.fn(),
  uninstallStatusline: vi.fn(),
}));
vi.mock("../../account/profiles", () => ({
  saveProfile: vi.fn(),
  updateProfile: vi.fn(),
  listProfiles: () => [],
}));

import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { handleAccountMessage } from "../accountHandlers";
import type { HostContext } from "../hostContext";
import type { WebviewMessage } from "../types";

function makeCtx(webview: unknown = {}): HostContext {
  return { getWebview: () => webview } as unknown as HostContext;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("handleAccountMessage — getAccountData model revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace = "/ws";
    parseAccountData.mockReturnValue({ marker: "account" });
  });

  it("re-pushes account data when a CLI upgrade changed the model cache", async () => {
    revalidateModelCache.mockResolvedValue(true);
    const ctx = makeCtx();

    await handleAccountMessage({ type: "getAccountData" } as WebviewMessage, ctx);
    await flush();

    // One immediate push with the cached parse, one after revalidation found
    // a newer CLI binary.
    expect(postAccountData).toHaveBeenCalledTimes(2);
  });

  it("does not re-push when the model cache was already fresh", async () => {
    revalidateModelCache.mockResolvedValue(false);
    const ctx = makeCtx();

    await handleAccountMessage({ type: "getAccountData" } as WebviewMessage, ctx);
    await flush();

    expect(postAccountData).toHaveBeenCalledTimes(1);
  });

  it("skips the re-push if the webview was disposed while revalidating", async () => {
    let live: unknown = {};
    // Deferred so we can dispose the webview BEFORE revalidation resolves,
    // deterministically (a plain mockResolvedValue races the await).
    let resolveRevalidate!: (v: boolean) => void;
    revalidateModelCache.mockReturnValue(
      new Promise<boolean>((r) => {
        resolveRevalidate = r;
      }),
    );
    const ctx = { getWebview: () => live } as unknown as HostContext;

    await handleAccountMessage({ type: "getAccountData" } as WebviewMessage, ctx);
    live = undefined; // webview disposed while the scan is still in flight
    resolveRevalidate(true);
    await flush();

    expect(postAccountData).toHaveBeenCalledTimes(1);
  });
});

// fs is a native ESM namespace and can't be spied on, so this test writes
// to a real temp file (the repo convention — see account/profiles.test.ts)
// and reads it back to prove the base64 was decoded and persisted.
describe("handleAccountMessage — saveStatsImage", () => {
  const PNG_B64 = Buffer.from("fake-png-bytes").toString("base64");
  const targets: string[] = [];

  function tmpTarget(): string {
    const p = path.join(os.tmpdir(), `csm-share-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    targets.push(p);
    return p;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    workspace = "/ws";
  });

  afterEach(() => {
    for (const p of targets.splice(0)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* already gone */
      }
    }
  });

  it("decodes the base64, writes the chosen file, and toasts success", async () => {
    const target = tmpTarget();
    const info = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);
    vi.spyOn(vscode.window, "showSaveDialog").mockResolvedValue({
      fsPath: target,
    } as unknown as vscode.Uri);

    await handleAccountMessage(
      { type: "saveStatsImage", pngBase64: PNG_B64 } as WebviewMessage,
      makeCtx(),
    );

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target).toString()).toBe("fake-png-bytes");
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the user cancels the save dialog", async () => {
    const target = tmpTarget();
    vi.spyOn(vscode.window, "showSaveDialog").mockResolvedValue(undefined);

    await handleAccountMessage(
      { type: "saveStatsImage", pngBase64: PNG_B64 } as WebviewMessage,
      makeCtx(),
    );

    expect(fs.existsSync(target)).toBe(false);
  });
});
