import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { getCurrentBranch } from "../git";

describe("getCurrentBranch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty string when git extension is not found", () => {
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined as any);
    expect(getCurrentBranch()).toBe("");
  });

  it("returns empty string when git extension is not active", () => {
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
      isActive: false,
      exports: undefined,
    } as any);
    expect(getCurrentBranch()).toBe("");
  });

  it("returns empty string when no repositories exist", () => {
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({ repositories: [] }),
      },
    } as any);
    expect(getCurrentBranch()).toBe("");
  });

  it("returns the branch name from the first repository", () => {
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [
            { state: { HEAD: { name: "feature/my-branch" } } },
          ],
        }),
      },
    } as any);
    expect(getCurrentBranch()).toBe("feature/my-branch");
  });

  it("returns empty string when HEAD has no name", () => {
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [{ state: { HEAD: {} } }],
        }),
      },
    } as any);
    expect(getCurrentBranch()).toBe("");
  });

  it("returns empty string when getAPI throws", () => {
    vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => {
          throw new Error("API unavailable");
        },
      },
    } as any);
    expect(getCurrentBranch()).toBe("");
  });
});
