import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const dirs = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-session-files");
  return {
    ROOT: root,
    HISTORY_FILE: _path.join(root, "history.jsonl"),
    PROJECTS_DIR: _path.join(root, "projects"),
    FILE_HISTORY_DIR: _path.join(root, "file-history"),
    SESSION_ENV_DIR: _path.join(root, "session-env"),
  };
});

vi.mock("../../../core/config", () => ({
  HISTORY_FILE: dirs.HISTORY_FILE,
  PROJECTS_DIR: dirs.PROJECTS_DIR,
  FILE_HISTORY_DIR: dirs.FILE_HISTORY_DIR,
  SESSION_ENV_DIR: dirs.SESSION_ENV_DIR,
}));

import { deleteSessionFiles, stripHistoryLines } from "../sessionFiles";

const A = "aaaaaaaa-1111-2222-3333-444444444444";
const B = "bbbbbbbb-1111-2222-3333-444444444444";

function write(file: string, body = "x"): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function writeHistory(rows: object[]): void {
  write(dirs.HISTORY_FILE, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

function historyIds(): string[] {
  return fs
    .readFileSync(dirs.HISTORY_FILE, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as { sessionId: string }).sessionId);
}

/** Every file Claude Code keeps for a session, the way a real run lays them out. */
function seedSession(id: string, project = "-Users-me-repo"): string[] {
  const files = [
    path.join(dirs.PROJECTS_DIR, project, `${id}.jsonl`),
    path.join(dirs.PROJECTS_DIR, project, id, "subagents", "agent-1.jsonl"),
    path.join(dirs.FILE_HISTORY_DIR, id, "abc@v1"),
    path.join(dirs.SESSION_ENV_DIR, id, "env"),
  ];
  for (const f of files) write(f);
  return files;
}

beforeEach(() => {
  fs.rmSync(dirs.ROOT, { recursive: true, force: true });
  fs.mkdirSync(dirs.ROOT, { recursive: true });
});

describe("deleteSessionFiles", () => {
  it("removes every file of the session and its history rows, nothing else", () => {
    const doomed = seedSession(A);
    const kept = seedSession(B);
    const memory = path.join(dirs.PROJECTS_DIR, "-Users-me-repo", "memory", "MEMORY.md");
    write(memory);
    writeHistory([
      { sessionId: A, display: "secret prompt" },
      { sessionId: B, display: "keep" },
    ]);

    expect(deleteSessionFiles([A])).toEqual({ deleted: [A], failed: [] });

    for (const f of doomed) expect(fs.existsSync(f)).toBe(false);
    expect(fs.existsSync(path.join(dirs.PROJECTS_DIR, "-Users-me-repo", A))).toBe(false);
    for (const f of [...kept, memory]) expect(fs.existsSync(f)).toBe(true);
    expect(historyIds()).toEqual([B]);
  });

  it("finds a transcript under every project folder it was written to", () => {
    seedSession(A, "-Users-me-repo");
    const other = path.join(dirs.PROJECTS_DIR, "-Users-me-other", `${A}.jsonl`);
    write(other);
    deleteSessionFiles([A]);
    expect(fs.existsSync(other)).toBe(false);
  });

  it("deletes several sessions with one history rewrite", () => {
    seedSession(A);
    seedSession(B);
    writeHistory([{ sessionId: A }, { sessionId: B }, { sessionId: "other" }]);
    expect(deleteSessionFiles([A, B]).deleted).toEqual([A, B]);
    expect(historyIds()).toEqual(["other"]);
  });

  it("refuses anything that is not a session id", () => {
    write(path.join(dirs.ROOT, "victim"));
    const result = deleteSessionFiles(["../victim", ""]);
    expect(result.deleted).toEqual([]);
    expect(result.failed.map((f) => f.error)).toEqual(["not a session id", "not a session id"]);
    expect(fs.existsSync(path.join(dirs.ROOT, "victim"))).toBe(true);
  });

  it("removes a symlinked session folder without following it", () => {
    const outside = path.join(dirs.ROOT, "outside", "keep.txt");
    write(outside);
    fs.mkdirSync(dirs.FILE_HISTORY_DIR, { recursive: true });
    fs.symlinkSync(path.dirname(outside), path.join(dirs.FILE_HISTORY_DIR, A));
    deleteSessionFiles([A]);
    expect(fs.existsSync(path.join(dirs.FILE_HISTORY_DIR, A))).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it("succeeds for a session with no files left and no projects folder", () => {
    expect(deleteSessionFiles([A])).toEqual({ deleted: [A], failed: [] });
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports a history rewrite that failed instead of hiding it",
    () => {
      seedSession(A);
      writeHistory([{ sessionId: A, display: "secret prompt" }]);
      // history.jsonl's folder read-only: the atomic rewrite cannot create
      // its temp file, while the session's own folders stay deletable.
      fs.chmodSync(dirs.ROOT, 0o555);
      try {
        const result = deleteSessionFiles([A]);
        expect(result.deleted).toEqual([A]);
        expect(result.historyError).toMatch(/EACCES|permission/i);
      } finally {
        fs.chmodSync(dirs.ROOT, 0o755);
      }
    },
  );
});

describe("stripHistoryLines", () => {
  it("removes matching session lines and keeps the rest", () => {
    writeHistory([
      { sessionId: "keep-1", display: "a" },
      { sessionId: "drop-1", display: "b" },
      { sessionId: "keep-2", display: "c" },
      { sessionId: "drop-2", display: "d" },
    ]);
    stripHistoryLines(["drop-1", "drop-2"]);
    expect(historyIds()).toEqual(["keep-1", "keep-2"]);
  });

  it("preserves malformed lines untouched", () => {
    write(
      dirs.HISTORY_FILE,
      `{"sessionId":"drop-1","display":"a"}\nnot-json\n{"sessionId":"keep","display":"b"}\n`,
    );
    stripHistoryLines(["drop-1"]);
    const raw = fs.readFileSync(dirs.HISTORY_FILE, "utf-8");
    expect(raw).toContain("not-json");
    expect(raw).toContain("keep");
    expect(raw).not.toContain("drop-1");
  });

  it("is a no-op when history.jsonl is missing", () => {
    expect(() => stripHistoryLines(["x"])).not.toThrow();
  });

  it("is a no-op for an empty id list even if history exists", () => {
    writeHistory([{ sessionId: "x", display: "a" }]);
    const before = fs.readFileSync(dirs.HISTORY_FILE, "utf-8");
    stripHistoryLines([]);
    expect(fs.readFileSync(dirs.HISTORY_FILE, "utf-8")).toBe(before);
  });
});
