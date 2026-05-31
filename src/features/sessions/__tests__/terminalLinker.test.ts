import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__mocks__/vscode"));

import * as vscode from "vscode";
import { createTerminalLinker, extractResumeId } from "../terminalLinker";
import { createTerminalRegistry } from "../terminalRegistry";

const UUID = "01abcdef-2345-6789-abcd-ef0123456789";

describe("extractResumeId", () => {
  it("pulls the uuid from a plain claude --resume invocation", () => {
    expect(extractResumeId(`claude --resume ${UUID}`)).toBe(UUID);
  });

  it("ignores invocations without --resume", () => {
    expect(extractResumeId("claude --continue")).toBeNull();
    expect(extractResumeId("claude")).toBeNull();
  });

  it("matches after a path prefix or env var", () => {
    expect(extractResumeId(`/usr/local/bin/claude --resume ${UUID}`)).toBe(UUID);
    expect(extractResumeId(`ANTHROPIC_API_KEY=x claude --resume ${UUID}`)).toBe(UUID);
  });

  it("matches after a shell separator", () => {
    expect(extractResumeId(`cd /tmp && claude --resume ${UUID}`)).toBe(UUID);
    expect(extractResumeId(`echo hi ; claude --resume ${UUID}`)).toBe(UUID);
    expect(extractResumeId(`true | claude --resume ${UUID}`)).toBe(UUID);
  });

  it("matches extra flags between claude and --resume", () => {
    expect(extractResumeId(`claude --dangerously-skip-permissions --resume ${UUID}`)).toBe(UUID);
  });

  it("lowercases the captured id so the registry stays case-insensitive", () => {
    expect(extractResumeId(`claude --resume ${UUID.toUpperCase()}`)).toBe(UUID);
  });

  it("rejects malformed uuids", () => {
    expect(extractResumeId("claude --resume not-a-uuid")).toBeNull();
    expect(extractResumeId("claude --resume 12345")).toBeNull();
  });

  it("does not match unrelated commands that happen to contain 'resume'", () => {
    expect(extractResumeId(`other-tool --resume ${UUID}`)).toBeNull();
  });
});

describe("createTerminalLinker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a no-op disposable when the host VS Code lacks the API", () => {
    const reg = createTerminalRegistry();
    const before = (vscode.window as unknown as { onDidStartTerminalShellExecution?: unknown })
      .onDidStartTerminalShellExecution;
    delete (vscode.window as unknown as { onDidStartTerminalShellExecution?: unknown })
      .onDidStartTerminalShellExecution;
    try {
      const sub = createTerminalLinker(reg);
      expect(typeof sub.dispose).toBe("function");
      sub.dispose();
    } finally {
      if (before !== undefined) {
        (vscode.window as unknown as { onDidStartTerminalShellExecution?: unknown })
          .onDidStartTerminalShellExecution = before;
      }
    }
  });

  it("registers the session id for the terminal whose shell ran claude --resume", () => {
    const reg = createTerminalRegistry();
    let listener: ((e: unknown) => void) | undefined;
    (vscode.window as unknown as {
      onDidStartTerminalShellExecution: (
        cb: (e: unknown) => void,
      ) => { dispose: () => void };
    }).onDidStartTerminalShellExecution = (cb) => {
      listener = cb;
      return { dispose: () => {} };
    };
    createTerminalLinker(reg);
    const fakeTerm = { name: "user-tab", show: vi.fn() } as unknown as vscode.Terminal;
    listener?.({
      terminal: fakeTerm,
      execution: { commandLine: { value: `claude --resume ${UUID}` } },
    });
    expect(reg.has(UUID)).toBe(true);
    expect(reg.ids()).toContain(UUID);
  });

  it("ignores command lines without a resume id", () => {
    const reg = createTerminalRegistry();
    let listener: ((e: unknown) => void) | undefined;
    (vscode.window as unknown as {
      onDidStartTerminalShellExecution: (
        cb: (e: unknown) => void,
      ) => { dispose: () => void };
    }).onDidStartTerminalShellExecution = (cb) => {
      listener = cb;
      return { dispose: () => {} };
    };
    createTerminalLinker(reg);
    listener?.({
      terminal: { name: "x", show: vi.fn() } as unknown as vscode.Terminal,
      execution: { commandLine: { value: "ls -la" } },
    });
    expect(reg.ids()).toEqual([]);
  });
});
