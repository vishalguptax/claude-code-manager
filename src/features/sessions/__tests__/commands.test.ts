import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

// Hoist the temp dir so vi.mock factories can see it.
const { CLAUDE_DIR, PROJECTS_DIR, EXPORT_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-commands");
  return {
    CLAUDE_DIR: root,
    PROJECTS_DIR: _path.join(root, "projects"),
    EXPORT_DIR: _path.join(root, "exports"),
  };
});

vi.mock("../../../core/config", () => ({
  CLAUDE_DIR,
  HISTORY_FILE: path.join(CLAUDE_DIR, "history.jsonl"),
  PROJECTS_DIR,
  SESSIONS_DIR: path.join(CLAUDE_DIR, "sessions"),
  STATE_FILE: path.join(CLAUDE_DIR, ".csm-state.json"),
  SESSION_META_READ_BYTES: 4096,
}));

// Mock branch + workspace so resumeSession's branch-mismatch path is reachable.
// getWorkspace's default behavior must mirror vscode.workspace.workspaceFolders[0]
// so existing importSessionFile tests (which set workspaceFolders) keep working.
let mockedCurrentBranch = "main";
let mockedWorkspaceOverride: string | undefined;
vi.mock("../../../extension/git", () => ({
  getCurrentBranch: () => mockedCurrentBranch,
}));
vi.mock("../../../extension/workspace", async () => {
  const _vscode = await import("vscode");
  return {
    getWorkspace: () => {
      if (mockedWorkspaceOverride !== undefined) return mockedWorkspaceOverride;
      const folders = _vscode.workspace.workspaceFolders;
      return folders && folders.length > 0 ? folders[0].uri.fsPath : "";
    },
  };
});

// Stub the terminal so importSessionFile does not actually try to launch one.
const sentTextCalls: string[] = [];
vi.mock("../../../extension/terminal", async () => {
  const actual = await vi.importActual<typeof import("../../../extension/terminal")>(
    "../../../extension/terminal",
  );
  return {
    createTerminal: () => ({
      show: () => {},
      sendText: (t: string) => {
        sentTextCalls.push(t);
      },
    }),
    validateGitRef: actual.validateGitRef,
  };
});

import {
  exportSessionFile,
  importSessionFile,
  importMultipleSessionFiles,
  resumeSession,
  setSessionStorage,
} from "../commands";
import { writeZip, type ZipEntry } from "../../brain/zip";
import type { Session } from "../types";

/** Build a fake Memento backed by an in-memory Map for tests. */
function makeMemento(): {
  bag: Map<string, unknown>;
  memento: { get<T>(key: string): T | undefined; update(key: string, value: unknown): Thenable<void> };
} {
  const bag = new Map<string, unknown>();
  return {
    bag,
    memento: {
      get<T>(key: string): T | undefined {
        return bag.get(key) as T | undefined;
      },
      update(key: string, value: unknown): Thenable<void> {
        bag.set(key, value);
        return Promise.resolve();
      },
    },
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "67212bf2-aaab-47bf-858a-b9e33a6a96a7",
    name: "Test session",
    project: "claude-manager",
    projectPath: "/work/claude-manager",
    branch: "main",
    entrypoint: "cli",
    startTime: 1700000000000,
    endTime: 1700000010000,
    messageCount: 3,
    summary: "Test summary",
    prompts: ["hi"],
    projectKey: "claude-manager",
    searchHaystack: "test session\nclaude-manager\nmain\ntest summary",
    ...overrides,
  };
}

function writeSessionFile(sess: Session, content: string): string {
  const slug = sess.projectPath.replace(/[/\\:]/g, "-");
  const dir = path.join(PROJECTS_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sess.id}.jsonl`);
  fs.writeFileSync(file, content);
  return file;
}

beforeEach(() => {
  fs.rmSync(CLAUDE_DIR, { recursive: true, force: true });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  sentTextCalls.length = 0;
  mockedWorkspaceOverride = undefined;
  mockedCurrentBranch = "main";
  vi.restoreAllMocks();
  // Each test gets a fresh memento by default. Tests that want to assert on
  // the storage state install their own via setSessionStorage().
  setSessionStorage(makeMemento().memento as unknown as import("vscode").Memento);
});

// ─────────────────────────────────────────────────────────────────────
// exportSessionFile
// ─────────────────────────────────────────────────────────────────────

describe("exportSessionFile", () => {
  it("copies the source jsonl verbatim when the user picks a save location", async () => {
    const sess = makeSession();
    const sourceContent = `{"sessionId":"${sess.id}","message":{"role":"user","content":"hi"}}\n`;
    writeSessionFile(sess, sourceContent);

    const target = path.join(EXPORT_DIR, "exported.jsonl");
    vi.spyOn(vscode.window, "showSaveDialog").mockResolvedValue(
      vscode.Uri.file(target) as unknown as vscode.Uri,
    );
    const infoSpy = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);

    await exportSessionFile(sess.id, [sess]);

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, "utf-8")).toBe(sourceContent);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("exported.jsonl"));
  });

  it("does nothing when the user cancels the save dialog", async () => {
    const sess = makeSession();
    writeSessionFile(sess, `{"sessionId":"${sess.id}","message":{"role":"user","content":"hi"}}\n`);

    vi.spyOn(vscode.window, "showSaveDialog").mockResolvedValue(undefined);
    const infoSpy = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);

    await exportSessionFile(sess.id, [sess]);

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("shows an error when the source session file is missing on disk", async () => {
    const sess = makeSession();
    // Note: do NOT call writeSessionFile — file is missing
    const errSpy = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockResolvedValue(undefined);

    await exportSessionFile(sess.id, [sess]);

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Could not locate"));
  });

  it("shows an error when the session is not in the current list", async () => {
    const errSpy = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockResolvedValue(undefined);

    await exportSessionFile("nonexistent-id", []);

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });
});

// ─────────────────────────────────────────────────────────────────────
// importSessionFile
// ─────────────────────────────────────────────────────────────────────

describe("importSessionFile", () => {
  /** Build a valid portable session file for tests. */
  function writePortableSource(sessionId: string): string {
    const content =
      `{"sessionId":"${sessionId}","type":"permission-mode"}\n` +
      `{"sessionId":"${sessionId}","message":{"role":"user","content":"hello"}}\n` +
      `{"sessionId":"${sessionId}","message":{"role":"assistant","content":"hi"}}\n`;
    const file = path.join(EXPORT_DIR, `portable-${sessionId.slice(0, 8)}.jsonl`);
    fs.writeFileSync(file, content);
    return file;
  }

  function mockOpenDialog(filePath: string | undefined): void {
    vi.spyOn(vscode.window, "showOpenDialog").mockResolvedValue(
      filePath ? [vscode.Uri.file(filePath) as unknown as vscode.Uri] : undefined,
    );
  }

  function mockProjectPickCurrent(): void {
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation(
      // The first item in the QuickPick is always "Current Workspace" when ws is set.
      async (items: unknown) => (items as Array<{ project?: unknown }>)[0],
    );
  }

  function mockConfirm(answer: string | undefined): void {
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(
      answer as unknown as undefined,
    );
  }

  function mockWorkspace(folder: string): void {
    interface MutableWs {
      workspaceFolders: Array<{ uri: { fsPath: string }; name: string; index: number }>;
    }
    (vscode.workspace as unknown as MutableWs).workspaceFolders = [
      { uri: { fsPath: folder }, name: path.basename(folder), index: 0 },
    ];
  }

  it("imports a valid session into the current workspace and launches resume", async () => {
    const oldId = "67212bf2-aaab-47bf-858a-b9e33a6a96a7";
    const sourceFile = writePortableSource(oldId);
    const workspaceDir = fs.realpathSync(EXPORT_DIR); // any existing dir
    mockWorkspace(workspaceDir);
    mockOpenDialog(sourceFile);
    mockProjectPickCurrent();
    mockConfirm("Import & Resume");
    vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    let reloadFired = false;
    await importSessionFile([], () => {
      reloadFired = true;
    });

    // Verify a session file was written under the workspace's slug
    const slug = workspaceDir.replace(/[/\\:]/g, "-");
    const targetDir = path.join(PROJECTS_DIR, slug);
    expect(fs.existsSync(targetDir)).toBe(true);
    const writtenFiles = fs.readdirSync(targetDir).filter((f) => f.endsWith(".jsonl"));
    expect(writtenFiles).toHaveLength(1);

    // Verify the new file has a fresh UUID inside, NOT the old one
    const newFile = path.join(targetDir, writtenFiles[0]);
    const newContent = fs.readFileSync(newFile, "utf-8");
    expect(newContent).not.toContain(oldId);
    // The new internal sessionId should match the filename
    const newId = writtenFiles[0].replace(".jsonl", "");
    expect(newContent).toContain(newId);

    // Verify the terminal was launched with --resume <new-id>
    expect(sentTextCalls).toHaveLength(1);
    expect(sentTextCalls[0]).toBe(`claude --resume ${newId}`);

    // Verify reload was triggered
    expect(reloadFired).toBe(true);
  });

  it("rejects an empty file with a clear error", async () => {
    const emptyFile = path.join(EXPORT_DIR, "empty.jsonl");
    fs.writeFileSync(emptyFile, "");
    mockWorkspace(EXPORT_DIR);
    mockOpenDialog(emptyFile);
    const errSpy = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    await importSessionFile([], () => {});

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("empty"));
    expect(sentTextCalls).toHaveLength(0);
  });

  it("rejects malformed JSON", async () => {
    const badFile = path.join(EXPORT_DIR, "bad.jsonl");
    fs.writeFileSync(badFile, '{"sessionId":"abc","message":{"role":"user"}}\nnot json\n');
    mockWorkspace(EXPORT_DIR);
    mockOpenDialog(badFile);
    const errSpy = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    await importSessionFile([], () => {});

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("malformed"));
    expect(sentTextCalls).toHaveLength(0);
  });

  it("does nothing when the user cancels the file picker", async () => {
    mockWorkspace(EXPORT_DIR);
    mockOpenDialog(undefined);
    const errSpy = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    await importSessionFile([], () => {});

    expect(errSpy).not.toHaveBeenCalled();
    expect(sentTextCalls).toHaveLength(0);
  });

  it("does nothing when the user cancels the confirmation dialog", async () => {
    const oldId = "67212bf2-aaab-47bf-858a-b9e33a6a96a7";
    const sourceFile = writePortableSource(oldId);
    mockWorkspace(EXPORT_DIR);
    mockOpenDialog(sourceFile);
    mockProjectPickCurrent();
    mockConfirm(undefined); // user dismisses

    await importSessionFile([], () => {});

    // No file should have been written, no terminal launched
    expect(sentTextCalls).toHaveLength(0);
  });

  it("rejects when the chosen target path does not exist on this machine", async () => {
    const oldId = "67212bf2-aaab-47bf-858a-b9e33a6a96a7";
    const sourceFile = writePortableSource(oldId);
    mockWorkspace(path.join(EXPORT_DIR, "does-not-exist-xyz"));
    mockOpenDialog(sourceFile);
    mockProjectPickCurrent();
    const errSpy = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    await importSessionFile([], () => {});

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("does not exist"));
    expect(sentTextCalls).toHaveLength(0);
  });

  it("each import generates a fresh UUID even from the same source file", async () => {
    const oldId = "67212bf2-aaab-47bf-858a-b9e33a6a96a7";
    const sourceFile = writePortableSource(oldId);
    mockWorkspace(EXPORT_DIR);
    vi.spyOn(vscode.window, "showOpenDialog").mockResolvedValue(
      [vscode.Uri.file(sourceFile) as unknown as vscode.Uri],
    );
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation(
      async (items: unknown) => (items as Array<{ project?: unknown }>)[0],
    );
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(
      "Import & Resume" as unknown as undefined,
    );

    await importSessionFile([], () => {});
    await importSessionFile([], () => {});

    const slug = EXPORT_DIR.replace(/[/\\:]/g, "-");
    const targetDir = path.join(PROJECTS_DIR, slug);
    const writtenFiles = fs.readdirSync(targetDir).filter((f) => f.endsWith(".jsonl"));
    expect(writtenFiles).toHaveLength(2);
    expect(writtenFiles[0]).not.toBe(writtenFiles[1]);
    expect(sentTextCalls).toHaveLength(2);
    expect(sentTextCalls[0]).not.toBe(sentTextCalls[1]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// importMultipleSessionFiles (bulk import)
// ─────────────────────────────────────────────────────────────────────

describe("importMultipleSessionFiles", () => {
  /** One valid single-user-message transcript for the given id. */
  function portable(id: string): string {
    return `{"sessionId":"${id}","message":{"role":"user","content":"hi"}}\n`;
  }

  /** Build a bulk-export-shaped zip with a manifest + sessions/ members. */
  function makeZip(members: Array<{ id: string; projectPath?: string }>): Buffer {
    const entries: ZipEntry[] = [
      {
        path: "manifest.json",
        data: Buffer.from(
          JSON.stringify({
            version: 1,
            sessions: members.map((m) => ({
              id: m.id,
              file: `${m.id}.jsonl`,
              projectPath: m.projectPath,
            })),
          }),
        ),
      },
    ];
    for (const m of members) {
      entries.push({ path: `sessions/${m.id}.jsonl`, data: Buffer.from(portable(m.id)) });
    }
    return writeZip(entries);
  }

  function writeFile(name: string, data: Buffer | string): string {
    const file = path.join(EXPORT_DIR, name);
    fs.writeFileSync(file, data);
    return file;
  }

  function mockOpen(...files: string[]): void {
    vi.spyOn(vscode.window, "showOpenDialog").mockResolvedValue(
      files.map((f) => vscode.Uri.file(f) as unknown as vscode.Uri),
    );
  }

  /** pickImportTarget → the first QuickPick item, i.e. Current Workspace. */
  function mockFallbackCurrent(): void {
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation(
      async (items: unknown) => (items as Array<{ project?: unknown }>)[0],
    );
  }

  function mockConfirm(answer: string | undefined): void {
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(
      answer as unknown as undefined,
    );
  }

  function mockWorkspace(folder: string): void {
    interface MutableWs {
      workspaceFolders: Array<{ uri: { fsPath: string }; name: string; index: number }>;
    }
    (vscode.workspace as unknown as MutableWs).workspaceFolders = [
      { uri: { fsPath: folder }, name: path.basename(folder), index: 0 },
    ];
  }

  function jsonlFilesUnder(projectPath: string): string[] {
    const dir = path.join(PROJECTS_DIR, projectPath.replace(/[/\\:]/g, "-"));
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  }

  it("restores sessions to their original project when the path exists here", async () => {
    const origProject = fs.realpathSync(path.join(EXPORT_DIR)); // an existing dir
    const zip = writeFile("bundle.zip", makeZip([{ id: "aaaaaaaa-0000-0000-0000-000000000001", projectPath: origProject }]));
    mockWorkspace(origProject);
    mockOpen(zip);
    mockConfirm("Import");
    const qp = vi.spyOn(vscode.window, "showQuickPick");

    let reloaded = false;
    await importMultipleSessionFiles([], () => {
      reloaded = true;
    });

    // All paths exist → no fallback picker shown.
    expect(qp).not.toHaveBeenCalled();
    const written = jsonlFilesUnder(origProject);
    expect(written).toHaveLength(1);
    // Fresh UUID, not the source id.
    expect(written[0]).not.toContain("aaaaaaaa-0000");
    expect(reloaded).toBe(true);
    // No terminal launched for bulk import.
    expect(sentTextCalls).toHaveLength(0);
  });

  it("routes sessions whose original path is missing to the picked fallback", async () => {
    const zip = writeFile(
      "bundle.zip",
      makeZip([{ id: "bbbbbbbb-0000-0000-0000-000000000002", projectPath: "/does/not/exist/here" }]),
    );
    mockWorkspace(EXPORT_DIR);
    mockOpen(zip);
    mockFallbackCurrent();
    mockConfirm("Import");

    await importMultipleSessionFiles([], () => {});

    expect(jsonlFilesUnder(EXPORT_DIR)).toHaveLength(1);
    expect(jsonlFilesUnder("/does/not/exist/here")).toHaveLength(0);
  });

  it("imports loose .jsonl files into the fallback project", async () => {
    const a = writeFile("a.jsonl", portable("cccccccc-0000-0000-0000-000000000003"));
    const b = writeFile("b.jsonl", portable("dddddddd-0000-0000-0000-000000000004"));
    mockWorkspace(EXPORT_DIR);
    mockOpen(a, b);
    mockFallbackCurrent();
    mockConfirm("Import");

    await importMultipleSessionFiles([], () => {});

    expect(jsonlFilesUnder(EXPORT_DIR)).toHaveLength(2);
  });

  it("skips invalid entries but still imports the valid ones", async () => {
    const zip = writeFile("bundle.zip", makeZip([{ id: "eeeeeeee-0000-0000-0000-000000000005" }]));
    const empty = writeFile("empty.jsonl", "");
    mockWorkspace(EXPORT_DIR);
    mockOpen(zip, empty);
    mockFallbackCurrent();
    mockConfirm("Import");

    await importMultipleSessionFiles([], () => {});

    expect(jsonlFilesUnder(EXPORT_DIR)).toHaveLength(1);
  });

  it("errors and writes nothing when no importable session is found", async () => {
    const empty = writeFile("empty.jsonl", "");
    mockWorkspace(EXPORT_DIR);
    mockOpen(empty);
    const errSpy = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    let reloaded = false;
    await importMultipleSessionFiles([], () => {
      reloaded = true;
    });

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("No importable sessions"));
    expect(reloaded).toBe(false);
  });

  it("does nothing when the user cancels the file picker", async () => {
    vi.spyOn(vscode.window, "showOpenDialog").mockResolvedValue(undefined);
    const errSpy = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    await importMultipleSessionFiles([], () => {});

    expect(errSpy).not.toHaveBeenCalled();
    expect(jsonlFilesUnder(EXPORT_DIR)).toHaveLength(0);
  });

  it("writes nothing when the user cancels the confirmation", async () => {
    const zip = writeFile("bundle.zip", makeZip([{ id: "ffffffff-0000-0000-0000-000000000006" }]));
    mockWorkspace(EXPORT_DIR);
    mockOpen(zip);
    mockFallbackCurrent();
    mockConfirm(undefined); // dismissed

    await importMultipleSessionFiles([], () => {});

    expect(jsonlFilesUnder(EXPORT_DIR)).toHaveLength(0);
  });

  it("never overwrites an existing session — fresh UUID each import", async () => {
    const zip = writeFile("bundle.zip", makeZip([{ id: "99999999-0000-0000-0000-000000000009" }]));
    mockWorkspace(EXPORT_DIR);
    mockFallbackCurrent();
    mockConfirm("Import");
    mockOpen(zip);
    await importMultipleSessionFiles([], () => {});
    mockOpen(zip);
    await importMultipleSessionFiles([], () => {});

    const files = jsonlFilesUnder(EXPORT_DIR);
    expect(files).toHaveLength(2);
    expect(files[0]).not.toBe(files[1]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Last-folder memory (export & import)
// ─────────────────────────────────────────────────────────────────────

describe("last-folder memory", () => {
  it("stores the export folder after a successful save", async () => {
    const sess: Session = {
      id: "67212bf2-aaab-47bf-858a-b9e33a6a96a7",
      name: "Test",
      project: "claude-manager",
      projectPath: "/work/claude-manager",
      branch: "main",
      entrypoint: "cli",
      startTime: 0,
      endTime: 0,
      messageCount: 1,
      summary: "x",
      prompts: ["x"],
      projectKey: "claude-manager",
      searchHaystack: "test\nclaude-manager\nmain\nx",
    };
    const slug = sess.projectPath.replace(/[/\\:]/g, "-");
    fs.mkdirSync(path.join(PROJECTS_DIR, slug), { recursive: true });
    fs.writeFileSync(
      path.join(PROJECTS_DIR, slug, `${sess.id}.jsonl`),
      `{"sessionId":"${sess.id}"}\n`,
    );

    const m = makeMemento();
    setSessionStorage(m.memento as unknown as import("vscode").Memento);

    const target = path.join(EXPORT_DIR, "first.jsonl");
    vi.spyOn(vscode.window, "showSaveDialog").mockResolvedValue(
      vscode.Uri.file(target) as unknown as vscode.Uri,
    );
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);

    await exportSessionFile(sess.id, [sess]);

    expect(m.bag.get("claudeManager.lastExportDir")).toBe(EXPORT_DIR);
  });

  it("seeds the next export dialog with the stored folder", async () => {
    const sess: Session = {
      id: "67212bf2-aaab-47bf-858a-b9e33a6a96a7",
      name: "",
      project: "p",
      projectPath: "/work/p",
      branch: "",
      entrypoint: "",
      startTime: 0,
      endTime: 0,
      messageCount: 1,
      summary: "x",
      prompts: ["x"],
      projectKey: "p",
      searchHaystack: "\np\n\nx",
    };
    const slug = sess.projectPath.replace(/[/\\:]/g, "-");
    fs.mkdirSync(path.join(PROJECTS_DIR, slug), { recursive: true });
    fs.writeFileSync(
      path.join(PROJECTS_DIR, slug, `${sess.id}.jsonl`),
      `{"sessionId":"${sess.id}"}\n`,
    );

    const m = makeMemento();
    m.bag.set("claudeManager.lastExportDir", EXPORT_DIR);
    setSessionStorage(m.memento as unknown as import("vscode").Memento);

    const saveSpy = vi.spyOn(vscode.window, "showSaveDialog").mockResolvedValue(undefined);
    await exportSessionFile(sess.id, [sess]);

    expect(saveSpy).toHaveBeenCalledOnce();
    const opts = saveSpy.mock.calls[0][0] as { defaultUri?: { fsPath: string } };
    expect(opts.defaultUri?.fsPath.startsWith(EXPORT_DIR)).toBe(true);
  });

  it("ignores a stored export folder that no longer exists", async () => {
    const sess: Session = {
      id: "67212bf2-aaab-47bf-858a-b9e33a6a96a7",
      name: "",
      project: "p",
      projectPath: "/work/p",
      branch: "",
      entrypoint: "",
      startTime: 0,
      endTime: 0,
      messageCount: 1,
      summary: "x",
      prompts: ["x"],
      projectKey: "p",
      searchHaystack: "\np\n\nx",
    };
    const slug = sess.projectPath.replace(/[/\\:]/g, "-");
    fs.mkdirSync(path.join(PROJECTS_DIR, slug), { recursive: true });
    fs.writeFileSync(
      path.join(PROJECTS_DIR, slug, `${sess.id}.jsonl`),
      `{"sessionId":"${sess.id}"}\n`,
    );

    const m = makeMemento();
    m.bag.set("claudeManager.lastExportDir", path.join(EXPORT_DIR, "deleted-folder"));
    setSessionStorage(m.memento as unknown as import("vscode").Memento);

    const saveSpy = vi.spyOn(vscode.window, "showSaveDialog").mockResolvedValue(undefined);
    await exportSessionFile(sess.id, [sess]);

    const opts = saveSpy.mock.calls[0][0] as { defaultUri?: { fsPath: string } };
    // Falls back to the bare default filename (no folder prefix), so the
    // path equals just the filename.
    expect(opts.defaultUri?.fsPath).not.toContain("deleted-folder");
  });

  it("stores the import source folder after picking a file", async () => {
    const oldId = "67212bf2-aaab-47bf-858a-b9e33a6a96a7";
    const sourceFile = path.join(EXPORT_DIR, "src.jsonl");
    fs.writeFileSync(
      sourceFile,
      `{"sessionId":"${oldId}","message":{"role":"user","content":"hi"}}\n`,
    );

    interface MutableWs {
      workspaceFolders: Array<{ uri: { fsPath: string }; name: string; index: number }>;
    }
    (vscode.workspace as unknown as MutableWs).workspaceFolders = [
      { uri: { fsPath: EXPORT_DIR }, name: path.basename(EXPORT_DIR), index: 0 },
    ];

    const m = makeMemento();
    setSessionStorage(m.memento as unknown as import("vscode").Memento);

    vi.spyOn(vscode.window, "showOpenDialog").mockResolvedValue(
      [vscode.Uri.file(sourceFile) as unknown as vscode.Uri],
    );
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation(
      async (items: unknown) => (items as Array<{ project?: unknown }>)[0],
    );
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(
      "Import & Resume" as unknown as undefined,
    );

    await importSessionFile([], () => {});

    expect(m.bag.get("claudeManager.lastImportDir")).toBe(EXPORT_DIR);
  });

  it("seeds the import open dialog with the stored folder", async () => {
    interface MutableWs {
      workspaceFolders: Array<{ uri: { fsPath: string }; name: string; index: number }>;
    }
    (vscode.workspace as unknown as MutableWs).workspaceFolders = [
      { uri: { fsPath: EXPORT_DIR }, name: path.basename(EXPORT_DIR), index: 0 },
    ];

    const m = makeMemento();
    m.bag.set("claudeManager.lastImportDir", EXPORT_DIR);
    setSessionStorage(m.memento as unknown as import("vscode").Memento);

    const openSpy = vi.spyOn(vscode.window, "showOpenDialog").mockResolvedValue(undefined);

    await importSessionFile([], () => {});

    const opts = openSpy.mock.calls[0][0] as { defaultUri?: { fsPath: string } };
    expect(opts.defaultUri?.fsPath).toBe(EXPORT_DIR);
  });

  it("ignores a stored import folder that no longer exists", async () => {
    interface MutableWs {
      workspaceFolders: Array<{ uri: { fsPath: string }; name: string; index: number }>;
    }
    (vscode.workspace as unknown as MutableWs).workspaceFolders = [
      { uri: { fsPath: EXPORT_DIR }, name: path.basename(EXPORT_DIR), index: 0 },
    ];

    const m = makeMemento();
    m.bag.set("claudeManager.lastImportDir", path.join(EXPORT_DIR, "missing"));
    setSessionStorage(m.memento as unknown as import("vscode").Memento);

    const openSpy = vi.spyOn(vscode.window, "showOpenDialog").mockResolvedValue(undefined);

    await importSessionFile([], () => {});

    const opts = openSpy.mock.calls[0][0] as { defaultUri?: { fsPath: string } | undefined };
    expect(opts.defaultUri).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// resumeSession — branch-name security
// ─────────────────────────────────────────────────────────────────────

describe("resumeSession — malicious branch name", () => {
  it("refuses to switch when the session branch fails ref validation and never sendTexts shell meta", async () => {
    const malicious = 'x" && rm -rf /';
    const sess = makeSession({
      branch: malicious,
      projectPath: EXPORT_DIR,
    });
    mockedWorkspaceOverride = EXPORT_DIR;
    mockedCurrentBranch = "main";

    // User picks "Switch & Resume" so we reach the validation gate.
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(
      "Switch & Resume" as unknown as undefined,
    );
    const errSpy = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockResolvedValue(undefined);

    await resumeSession(sess.id, false, [sess]);

    // The error toast fires and no terminal command was sent.
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("not a valid git ref name"),
    );
    expect(sentTextCalls).toHaveLength(0);
    // Belt-and-suspenders: nothing we sent contained shell meta from the branch.
    for (const t of sentTextCalls) {
      expect(t).not.toContain('"');
      expect(t).not.toContain("rm -rf");
    }
  });
});
