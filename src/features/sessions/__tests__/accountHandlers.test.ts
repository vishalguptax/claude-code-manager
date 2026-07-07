import { describe, it, expect, beforeEach, vi } from "vitest";

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
