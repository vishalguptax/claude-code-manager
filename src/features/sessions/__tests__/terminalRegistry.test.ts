import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__mocks__/vscode"));

import * as vscode from "vscode";
// @ts-expect-error — _fireTerminalClose is a mock-only helper not in the real API
const { _fireTerminalClose } = vscode as { _fireTerminalClose: (t: unknown) => void };

import { createTerminalRegistry } from "../terminalRegistry";

function fakeTerminal(name = "t"): vscode.Terminal {
  return { name, show: vi.fn() } as unknown as vscode.Terminal;
}

describe("terminalRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers, reports membership, and lists ids", () => {
    const reg = createTerminalRegistry();
    const t = fakeTerminal();
    reg.register("s1", t);
    expect(reg.has("s1")).toBe(true);
    expect(reg.has("other")).toBe(false);
    expect(reg.ids()).toEqual(["s1"]);
  });

  it("view() focuses the registered terminal and returns false for unknown ids", () => {
    const reg = createTerminalRegistry();
    const t = fakeTerminal();
    reg.register("s1", t);
    expect(reg.view("s1")).toBe(true);
    expect((t.show as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(false);
    expect(reg.view("missing")).toBe(false);
  });

  it("rename() renames the session's terminal through VS Code's active-terminal command", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand");
    const reg = createTerminalRegistry();
    const t = fakeTerminal();
    reg.register("s1", t);

    expect(await reg.rename("s1", "Parser rewrite")).toBe(true);

    // Made active first — the command only acts on the active terminal —
    // without pulling the keyboard away from where the rename was typed.
    expect(t.show as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(true);
    expect(exec).toHaveBeenCalledWith("workbench.action.terminal.renameWithArg", {
      name: "Parser rewrite",
    });
  });

  it("rename() does nothing for an unknown id or an empty name", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand");
    const reg = createTerminalRegistry();
    const t = fakeTerminal();
    reg.register("s1", t);

    expect(await reg.rename("missing", "x")).toBe(false);
    expect(await reg.rename("s1", "")).toBe(false);
    expect(t.show as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("emits onChange when an id is added or replaced", () => {
    const reg = createTerminalRegistry();
    const cb = vi.fn();
    reg.onChange(cb);
    const t = fakeTerminal();
    reg.register("s1", t);
    expect(cb).toHaveBeenCalledWith(["s1"]);
    cb.mockClear();
    reg.register("s1", t);
    expect(cb).not.toHaveBeenCalled();
    const t2 = fakeTerminal();
    reg.register("s1", t2);
    expect(cb).toHaveBeenCalledWith(["s1"]);
  });

  it("drops the id and emits onChange when a registered terminal closes", () => {
    const reg = createTerminalRegistry();
    const cb = vi.fn();
    reg.onChange(cb);
    const t = fakeTerminal();
    reg.register("s1", t);
    cb.mockClear();
    _fireTerminalClose(t);
    expect(reg.has("s1")).toBe(false);
    expect(cb).toHaveBeenCalledWith([]);
  });

  it("ignores closes for terminals it never registered", () => {
    const reg = createTerminalRegistry();
    const cb = vi.fn();
    reg.onChange(cb);
    reg.register("s1", fakeTerminal("kept"));
    cb.mockClear();
    _fireTerminalClose(fakeTerminal("stranger"));
    expect(cb).not.toHaveBeenCalled();
    expect(reg.has("s1")).toBe(true);
  });

  it("stops notifying after dispose() and clears state", () => {
    const reg = createTerminalRegistry();
    const cb = vi.fn();
    reg.onChange(cb);
    reg.register("s1", fakeTerminal());
    cb.mockClear();
    reg.dispose();
    expect(reg.ids()).toEqual([]);
    _fireTerminalClose(fakeTerminal());
    expect(cb).not.toHaveBeenCalled();
  });

  it("onChange returns a disposable that unsubscribes", () => {
    const reg = createTerminalRegistry();
    const cb = vi.fn();
    const sub = reg.onChange(cb);
    sub.dispose();
    reg.register("s1", fakeTerminal());
    expect(cb).not.toHaveBeenCalled();
  });
});
