import { afterEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { UserState } from "../../../core/types";
import { pickFolder, promptFolderName, sortFolders } from "../folderPrompts";

function state(folders: Record<string, string>, empty: string[] = []): UserState {
  const folderNames = [...new Set([...Object.values(folders), ...empty])];
  return { pinned: [], renames: {}, archived: [], folders, folderNames };
}

type Pick = vscode.QuickPickItem & { action: string; folder?: string };

/** Stub the QuickPick: record the items it was shown, answer with `choose`. */
function stubPick(choose: (items: Pick[]) => Pick | undefined): { shown: () => Pick[] } {
  let shown: Pick[] = [];
  vi.spyOn(vscode.window, "showQuickPick").mockImplementation((async (items: Pick[]) => {
    shown = items;
    return choose(items);
  }) as never);
  return { shown: () => shown };
}

afterEach(() => vi.restoreAllMocks());

describe("sortFolders", () => {
  it("sorts without regard to case and leaves the input alone", () => {
    const names = ["zeta", "Alpha", "beta"];
    expect(sortFolders(names)).toEqual(["Alpha", "beta", "zeta"]);
    expect(names).toEqual(["zeta", "Alpha", "beta"]);
  });
});

describe("promptFolderName", () => {
  it("returns the trimmed name", async () => {
    vi.spyOn(vscode.window, "showInputBox").mockResolvedValue("  auth  ");
    expect(await promptFolderName("New folder")).toBe("auth");
  });

  it("returns null when dismissed", async () => {
    vi.spyOn(vscode.window, "showInputBox").mockResolvedValue(undefined);
    expect(await promptFolderName("New folder")).toBeNull();
  });

  it("rejects blank and over-long names", async () => {
    let validate: ((v: string) => string | null) | undefined;
    vi.spyOn(vscode.window, "showInputBox").mockImplementation((async (opts: {
      validateInput: (v: string) => string | null;
    }) => {
      validate = opts.validateInput;
      return undefined;
    }) as never);
    await promptFolderName("New folder");
    expect(validate?.("   ")).toBe("Enter a folder name");
    expect(validate?.("x".repeat(61))).toMatch(/60 characters/);
    expect(validate?.("auth")).toBeNull();
  });
});

describe("pickFolder", () => {
  it("offers existing folders with counts, then New folder; no Remove when nothing is filed", async () => {
    const pick = stubPick(() => undefined);
    await pickFolder(["x"], state({ a: "auth", b: "auth", c: "release" }));
    expect(pick.shown().map((i) => [i.label, i.description])).toEqual([
      ["$(folder) auth", "2 sessions"],
      ["$(folder) release", "1 session"],
      ["$(new-folder) New folder…", undefined],
    ]);
  });

  it("offers an empty folder, counted as zero", async () => {
    const pick = stubPick(() => undefined);
    await pickFolder(["x"], state({}, ["later"]));
    expect(pick.shown()[0]).toMatchObject({ label: "$(folder) later", description: "0 sessions" });
  });

  it("marks the folder holding every selected session as current and offers Remove", async () => {
    const pick = stubPick(() => undefined);
    await pickFolder(["a", "b"], state({ a: "auth", b: "auth", c: "release" }));
    expect(pick.shown()[0].description).toBe("current");
    expect(pick.shown().at(-1)?.label).toBe("$(close) Remove from folder");
  });

  it("marks no folder current when the selection spans folders", async () => {
    const pick = stubPick(() => undefined);
    await pickFolder(["a", "c"], state({ a: "auth", c: "release" }));
    expect(pick.shown().some((i) => i.description === "current")).toBe(false);
  });

  it("returns the picked folder", async () => {
    stubPick((items) => items.find((i) => i.folder === "release"));
    expect(await pickFolder(["x"], state({ c: "release" }))).toBe("release");
  });

  it("returns an empty name for Remove from folder", async () => {
    stubPick((items) => items.find((i) => i.action === "remove"));
    expect(await pickFolder(["a"], state({ a: "auth" }))).toBe("");
  });

  it("asks for a name for New folder", async () => {
    stubPick((items) => items.find((i) => i.action === "new"));
    vi.spyOn(vscode.window, "showInputBox").mockResolvedValue("release prep");
    expect(await pickFolder(["x"], state({}))).toBe("release prep");
  });

  it("returns null when the picker is dismissed", async () => {
    stubPick(() => undefined);
    expect(await pickFolder(["x"], state({}))).toBeNull();
  });
});
