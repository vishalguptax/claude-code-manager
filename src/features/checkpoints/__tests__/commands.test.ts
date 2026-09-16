import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const { FILE_HISTORY_DIR, ROOT } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-checkpoint-commands");
  return { ROOT: root, FILE_HISTORY_DIR: _path.join(root, "file-history") };
});

vi.mock("../../../core/config", () => ({ FILE_HISTORY_DIR }));

import {
  CHECKPOINT_SCHEME,
  backupNameFor,
  checkpointUri,
  disposeCheckpointProvider,
  ensureCheckpointProvider,
  isValidTarget,
  openCheckpointDiff,
  parseCheckpointUri,
  provideCheckpointContent,
  restoreCheckpoint,
} from "../commands";
import { hashFilePath } from "../parser";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";
const WORK_DIR = path.join(ROOT, "proj");
const FILE = path.join(WORK_DIR, "a.ts");

/** The bytes the checkpoint holds — deliberately not the working file's. */
const CHECKPOINT_TEXT = "export const a = 1;\r\nconst trailing = true;";
const WORKING_TEXT = "export const a = 999;\n";

function writeBlob(version: number, contents: string): void {
  const dir = path.join(FILE_HISTORY_DIR, SESSION);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${hashFilePath(FILE)}@v${version}`), contents);
}

beforeEach(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.mkdirSync(FILE_HISTORY_DIR, { recursive: true });
  fs.writeFileSync(FILE, WORKING_TEXT);
  vscode.workspace.textDocuments.length = 0;
  disposeCheckpointProvider();
});

afterEach(() => {
  vi.restoreAllMocks();
  disposeCheckpointProvider();
});

describe("backupNameFor", () => {
  it("derives the blob name the host will look for", () => {
    expect(backupNameFor("/a/b.ts", 3)).toBe(`${hashFilePath("/a/b.ts")}@v3`);
  });
});

describe("isValidTarget", () => {
  it("accepts a UUID, an absolute path and a positive version", () => {
    expect(isValidTarget(SESSION, "/a/b.ts", 1)).toBe(true);
  });

  it.each([
    ["a non-UUID session", "../../etc", "/a/b.ts", 1],
    ["a relative path", SESSION, "a/b.ts", 1],
    ["a traversing relative path", SESSION, "../../../etc/passwd", 1],
    ["version zero", SESSION, "/a/b.ts", 0],
    ["a negative version", SESSION, "/a/b.ts", -1],
    ["a fractional version", SESSION, "/a/b.ts", 1.5],
    ["NaN", SESSION, "/a/b.ts", NaN],
  ])("rejects %s", (_label, sessionId, filePath, version) => {
    expect(isValidTarget(sessionId as string, filePath as string, version as number)).toBe(
      false,
    );
  });
});

describe("checkpointUri / parseCheckpointUri", () => {
  it("round-trips the target through the URI", () => {
    const uri = checkpointUri(SESSION, FILE, 4);
    expect(uri.scheme).toBe(CHECKPOINT_SCHEME);
    // The path is the real file path, so the diff editor picks the language
    // mode and the title reads like the file it came from.
    expect(uri.path).toBe(FILE);
    expect(parseCheckpointUri(uri)).toEqual({
      sessionId: SESSION,
      filePath: FILE,
      version: 4,
    });
  });

  it("returns null when the query is missing", () => {
    expect(parseCheckpointUri({ path: FILE, query: "" })).toBeNull();
  });

  it("returns null when the session id in the query is not a UUID", () => {
    expect(parseCheckpointUri({ path: FILE, query: "sid=../../etc&v=1" })).toBeNull();
  });

  it("returns null when the path is not absolute", () => {
    expect(parseCheckpointUri({ path: "a.ts", query: `sid=${SESSION}&v=1` })).toBeNull();
  });
});

describe("provideCheckpointContent", () => {
  it("serves the blob's contents", () => {
    writeBlob(2, CHECKPOINT_TEXT);
    expect(provideCheckpointContent(checkpointUri(SESSION, FILE, 2))).toBe(
      CHECKPOINT_TEXT,
    );
  });

  it("explains rather than throws when the blob was pruned", () => {
    const text = provideCheckpointContent(checkpointUri(SESSION, FILE, 9));
    expect(text).toContain("no longer on disk");
  });

  it("explains rather than throws for an unparseable URI", () => {
    expect(provideCheckpointContent({ path: FILE, query: "" })).toContain(
      "no longer on disk",
    );
  });
});

describe("ensureCheckpointProvider", () => {
  it("registers once and reuses the same disposable", () => {
    const spy = vi.spyOn(vscode.workspace, "registerTextDocumentContentProvider");
    const first = ensureCheckpointProvider();
    const second = ensureCheckpointProvider();
    expect(second).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(CHECKPOINT_SCHEME);
  });
});

describe("openCheckpointDiff", () => {
  it("opens a diff of the checkpoint against the working file", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    const exec = vi.spyOn(vscode.commands, "executeCommand");

    expect(await openCheckpointDiff(SESSION, FILE, 2)).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    const [command, left, right, title] = exec.mock.calls[0] as [
      string,
      { scheme: string; path: string },
      { fsPath: string },
      string,
    ];
    expect(command).toBe("vscode.diff");
    expect(left.scheme).toBe(CHECKPOINT_SCHEME);
    expect(left.path).toBe(FILE);
    expect(right.fsPath).toBe(FILE);
    expect(title).toBe("a.ts — v2 ↔ working file");
  });

  it("does not copy the blob into a temp file", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    const before = fs.readdirSync(path.join(FILE_HISTORY_DIR, SESSION));
    await openCheckpointDiff(SESSION, FILE, 2);
    expect(fs.readdirSync(path.join(FILE_HISTORY_DIR, SESSION))).toEqual(before);
    expect(fs.readdirSync(WORK_DIR)).toEqual(["a.ts"]);
  });

  it("reports a pruned version instead of opening an empty diff", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand");
    const err = vi.spyOn(vscode.window, "showErrorMessage");

    expect(await openCheckpointDiff(SESSION, FILE, 2)).toBe(false);
    expect(exec).not.toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain("no longer on disk");
  });

  it("rejects a target that could not address a blob", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand");
    expect(await openCheckpointDiff("../../etc", FILE, 1)).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it("opens the checkpoint on its own when the working file is gone", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    fs.rmSync(FILE);
    const exec = vi.spyOn(vscode.commands, "executeCommand");
    const show = vi.spyOn(vscode.window, "showTextDocument");

    expect(await openCheckpointDiff(SESSION, FILE, 2)).toBe(true);
    expect(exec).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe("restoreCheckpoint", () => {
  it("never writes when the confirmation is declined", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    const warn = vi
      .spyOn(vscode.window, "showWarningMessage")
      .mockResolvedValue(undefined);
    const write = vi.spyOn(vscode.workspace.fs, "writeFile");
    const applyEdit = vi.spyOn(vscode.workspace, "applyEdit");

    expect(await restoreCheckpoint(SESSION, FILE, 2)).toEqual({
      ok: false,
      reason: "cancelled",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(applyEdit).not.toHaveBeenCalled();
    // The file on disk is untouched.
    expect(fs.readFileSync(FILE, "utf-8")).toBe(WORKING_TEXT);
  });

  it("never writes when the user dismisses the modal with Escape", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    // VS Code resolves to the "Cancel" string on some platforms.
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(
      "Cancel" as never,
    );
    const write = vi.spyOn(vscode.workspace.fs, "writeFile");

    expect((await restoreCheckpoint(SESSION, FILE, 2)).ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("confirms with a modal naming the file and the version", async () => {
    writeBlob(3, CHECKPOINT_TEXT);
    const warn = vi
      .spyOn(vscode.window, "showWarningMessage")
      .mockResolvedValue(undefined);

    await restoreCheckpoint(SESSION, FILE, 3);
    const [message, options] = warn.mock.calls[0] as [
      string,
      { modal: boolean; detail: string },
    ];
    expect(message).toBe("Restore a.ts to version 3?");
    expect(options.modal).toBe(true);
    expect(options.detail).toContain(FILE);
    expect(options.detail).toContain("version 3");
  });

  it("writes the checkpoint's exact bytes when confirmed", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Restore" as never);
    const write = vi
      .spyOn(vscode.workspace.fs, "writeFile")
      .mockImplementation(async (uri, content) => {
        fs.writeFileSync((uri as { fsPath: string }).fsPath, content);
      });

    expect(await restoreCheckpoint(SESSION, FILE, 2)).toEqual({ ok: true });
    expect(write).toHaveBeenCalledTimes(1);
    // Byte-exact, CRLF and missing trailing newline included: the write does
    // not go through a text model, so nothing normalises the content.
    expect(fs.readFileSync(FILE, "utf-8")).toBe(CHECKPOINT_TEXT);
    expect(fs.readFileSync(FILE)).toEqual(Buffer.from(CHECKPOINT_TEXT));
  });

  it("refuses a pruned version without prompting", async () => {
    const warn = vi.spyOn(vscode.window, "showWarningMessage");
    const err = vi.spyOn(vscode.window, "showErrorMessage");

    expect(await restoreCheckpoint(SESSION, FILE, 2)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(warn).not.toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain("no longer on disk");
  });

  it("refuses a target that could not address a blob without prompting", async () => {
    const warn = vi.spyOn(vscode.window, "showWarningMessage");
    expect(await restoreCheckpoint(SESSION, "relative.ts", 1)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("says so in the confirmation when the file is dirty in an open editor", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    vscode.workspace.textDocuments.push(openDoc({ isDirty: true }));
    const warn = vi
      .spyOn(vscode.window, "showWarningMessage")
      .mockResolvedValue(undefined);

    await restoreCheckpoint(SESSION, FILE, 2);
    const [, options] = warn.mock.calls[0] as [string, { detail: string }];
    expect(options.detail).toContain("unsaved changes");
  });

  it("omits the dirty warning when the open editor is clean", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    vscode.workspace.textDocuments.push(openDoc({ isDirty: false }));
    const warn = vi
      .spyOn(vscode.window, "showWarningMessage")
      .mockResolvedValue(undefined);

    await restoreCheckpoint(SESSION, FILE, 2);
    const [, options] = warn.mock.calls[0] as [string, { detail: string }];
    expect(options.detail).not.toContain("unsaved changes");
  });

  it("applies a WorkspaceEdit when the file is open, so undo can reverse it", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    const doc = openDoc({ isDirty: true });
    vscode.workspace.textDocuments.push(doc);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Restore" as never);
    const applyEdit = vi.spyOn(vscode.workspace, "applyEdit");
    const write = vi.spyOn(vscode.workspace.fs, "writeFile");
    const save = vi.spyOn(doc, "save");

    expect(await restoreCheckpoint(SESSION, FILE, 2)).toEqual({ ok: true });
    expect(write).not.toHaveBeenCalled();
    expect(applyEdit).toHaveBeenCalledTimes(1);
    const edit = applyEdit.mock.calls[0][0] as vscode.WorkspaceEdit & {
      replacements: Array<{ newText: string }>;
    };
    expect(edit.replacements[0].newText).toBe(CHECKPOINT_TEXT);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reports a failed edit instead of claiming success", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    vscode.workspace.textDocuments.push(openDoc({ isDirty: false }));
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Restore" as never);
    vi.spyOn(vscode.workspace, "applyEdit").mockResolvedValue(false);
    const err = vi.spyOn(vscode.window, "showErrorMessage");

    expect(await restoreCheckpoint(SESSION, FILE, 2)).toEqual({
      ok: false,
      reason: "write-failed",
    });
    expect(err).toHaveBeenCalled();
  });

  it("reports a write that throws instead of crashing the host", async () => {
    writeBlob(2, CHECKPOINT_TEXT);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Restore" as never);
    vi.spyOn(vscode.workspace.fs, "writeFile").mockRejectedValue(new Error("EACCES"));
    const err = vi.spyOn(vscode.window, "showErrorMessage");

    expect(await restoreCheckpoint(SESSION, FILE, 2)).toEqual({
      ok: false,
      reason: "write-failed",
    });
    expect(String(err.mock.calls[0][0])).toContain("EACCES");
  });
});

/** A `vscode.TextDocument` stub for `FILE`, as the host would report it open. */
function openDoc({ isDirty }: { isDirty: boolean }): vscode.MockTextDocument {
  return {
    uri: { fsPath: FILE, scheme: "file" },
    isDirty,
    lineCount: 1,
    lineAt: () => ({ range: { end: new vscode.Position(0, WORKING_TEXT.length) } }),
    getText: () => WORKING_TEXT,
    save: async () => true,
  };
}
