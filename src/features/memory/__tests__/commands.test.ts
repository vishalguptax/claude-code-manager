/**
 * Tests for the memory commands.
 *
 * The one that matters most is delete: it must name the file in a modal, and
 * a declined modal must leave the file on disk. The rest pin that a
 * webview-supplied `(project, fileName)` pair can never address anything
 * outside the memory directory.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const { PROJECTS_DIR, SETTINGS_FILE, ROOT } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-memory-commands");
  return {
    ROOT: root,
    PROJECTS_DIR: _path.join(root, "projects"),
    SETTINGS_FILE: _path.join(root, "settings.json"),
  };
});

vi.mock("../../../core/config", () => ({ PROJECTS_DIR, SETTINGS_FILE }));

import { deleteMemory, openMemory, resolveMemoryPath, revealMemory } from "../commands";

const PROJECT = "-Users-me-code-demo";
const MEM_DIR = path.join(PROJECTS_DIR, PROJECT, "memory");
const FILE = "fix-siblings-too.md";
const FILE_PATH = path.join(MEM_DIR, FILE);

/** A file outside the memory directory that traversal must never reach. */
const OUTSIDE = path.join(ROOT, "secret.md");

beforeEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(MEM_DIR, { recursive: true });
  fs.writeFileSync(FILE_PATH, "---\nname: fix-siblings-too\n---\nBody.\n");
  fs.writeFileSync(OUTSIDE, "do not touch");
});

describe("resolveMemoryPath", () => {
  it("resolves a real memory", () => {
    expect(resolveMemoryPath(PROJECT, FILE)).toBe(FILE_PATH);
  });

  it("returns null for a missing file", () => {
    expect(resolveMemoryPath(PROJECT, "gone.md")).toBeNull();
  });

  it("returns null for a traversing filename", () => {
    expect(resolveMemoryPath(PROJECT, "../../secret.md")).toBeNull();
  });

  it("returns null for a traversing project slug", () => {
    expect(resolveMemoryPath("..", FILE)).toBeNull();
  });

  it("returns null for a symlinked memory", () => {
    fs.symlinkSync(OUTSIDE, path.join(MEM_DIR, "linked.md"));
    expect(resolveMemoryPath(PROJECT, "linked.md")).toBeNull();
  });
});

describe("openMemory", () => {
  it("opens the resolved document", async () => {
    const open = vi
      .spyOn(vscode.workspace, "openTextDocument")
      .mockResolvedValue({ uri: { fsPath: FILE_PATH } } as never);
    const show = vi.spyOn(vscode.window, "showTextDocument").mockResolvedValue(undefined as never);
    expect(await openMemory(PROJECT, FILE)).toBe(true);
    expect(open).toHaveBeenCalledWith(FILE_PATH);
    expect(show).toHaveBeenCalled();
  });

  it("reports rather than throws when the memory is gone", async () => {
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    expect(await openMemory(PROJECT, "gone.md")).toBe(false);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("gone.md"));
  });

  it("never opens a path outside the memory directory", async () => {
    const open = vi.spyOn(vscode.workspace, "openTextDocument");
    vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined as never);
    expect(await openMemory(PROJECT, "../../secret.md")).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("revealMemory", () => {
  it("delegates to the built-in revealFileInOS command", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    expect(await revealMemory(PROJECT, FILE)).toBe(true);
    expect(exec).toHaveBeenCalledWith(
      "revealFileInOS",
      expect.objectContaining({ fsPath: FILE_PATH }),
    );
  });

  it("does not reveal a file it cannot resolve", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand");
    vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined as never);
    expect(await revealMemory(PROJECT, "../../secret.md")).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("deleteMemory", () => {
  it("confirms with a modal that names the file and its path", async () => {
    const warn = vi
      .spyOn(vscode.window, "showWarningMessage")
      .mockResolvedValue("Delete" as never);
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined as never);
    await deleteMemory(PROJECT, FILE);
    const [message, options] = warn.mock.calls[0] as [string, { modal: boolean; detail: string }];
    expect(message).toContain(FILE);
    expect(options.modal).toBe(true);
    expect(options.detail).toContain(FILE_PATH);
    // The user must be told the index is not repaired for them.
    expect(options.detail).toContain("MEMORY.md");
  });

  it("deletes the file once confirmed", async () => {
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Delete" as never);
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined as never);
    expect(await deleteMemory(PROJECT, FILE)).toEqual({ ok: true });
    expect(fs.existsSync(FILE_PATH)).toBe(false);
  });

  it("leaves the file on disk when the confirmation is declined", async () => {
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined as never);
    expect(await deleteMemory(PROJECT, FILE)).toEqual({ ok: false, reason: "cancelled" });
    expect(fs.existsSync(FILE_PATH)).toBe(true);
  });

  it("leaves the file on disk when the modal is dismissed with Escape", async () => {
    // VS Code resolves a dismissed modal with undefined; anything that is not
    // the exact "Delete" label must be treated as a refusal.
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Cancel" as never);
    expect((await deleteMemory(PROJECT, FILE)).ok).toBe(false);
    expect(fs.existsSync(FILE_PATH)).toBe(true);
  });

  it("refuses a traversing filename before it prompts", async () => {
    const warn = vi.spyOn(vscode.window, "showWarningMessage");
    vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined as never);
    expect(await deleteMemory(PROJECT, "../../secret.md")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(OUTSIDE)).toBe(true);
  });

  it("refuses a symlinked memory before it prompts", async () => {
    fs.symlinkSync(OUTSIDE, path.join(MEM_DIR, "linked.md"));
    const warn = vi.spyOn(vscode.window, "showWarningMessage");
    vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined as never);
    expect(await deleteMemory(PROJECT, "linked.md")).toEqual({ ok: false, reason: "missing" });
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(OUTSIDE)).toBe(true);
  });

  // Root ignores directory permissions, so the failure below cannot be
  // provoked there. Skipping beats a test that silently asserts nothing.
  const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

  it.skipIf(asRoot)("reports a failed delete instead of throwing", async () => {
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Delete" as never);
    const err = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined as never);
    // Removing write permission from the PARENT directory is what makes
    // unlink fail; the file's own mode does not govern its removal.
    fs.chmodSync(MEM_DIR, 0o500);
    try {
      expect(await deleteMemory(PROJECT, FILE)).toEqual({ ok: false, reason: "delete-failed" });
      expect(err).toHaveBeenCalledWith(expect.stringContaining("Could not delete"));
      expect(fs.existsSync(FILE_PATH)).toBe(true);
    } finally {
      fs.chmodSync(MEM_DIR, 0o700);
    }
  });
});
