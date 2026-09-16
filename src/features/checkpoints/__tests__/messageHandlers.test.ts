import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { FILE_HISTORY_DIR, ROOT } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const root = _path.join(_os.tmpdir(), ".claude-test-checkpoint-handlers");
  return { ROOT: root, FILE_HISTORY_DIR: _path.join(root, "file-history") };
});

vi.mock("../../../core/config", () => ({ FILE_HISTORY_DIR }));

// The command handlers are exercised against the vscode surface in
// commands.test.ts; here we only care that dispatch routes to them.
// vi.hoisted so the spies exist before vi.mock's factory runs.
const { openCheckpointDiff, restoreCheckpoint } = vi.hoisted(() => ({
  openCheckpointDiff: vi.fn(async () => true),
  restoreCheckpoint: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../commands", () => ({ openCheckpointDiff, restoreCheckpoint }));

import { handleCheckpointsMessage, type CheckpointsHostContext } from "../messageHandlers";
import { hashFilePath } from "../parser";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";
const FILE = "/proj/src/a.ts";
const TRANSCRIPTS = path.join(ROOT, "projects");

let posted: Array<Record<string, unknown>>;

function makeCtx(overrides: Partial<CheckpointsHostContext> = {}): CheckpointsHostContext {
  return {
    getWebview: () =>
      ({ postMessage: (m: Record<string, unknown>) => posted.push(m) }) as never,
    describeSession: () => undefined,
    transcriptPath: () => null,
    ...overrides,
  };
}

function writeBlob(name: string, contents: string): void {
  const dir = path.join(FILE_HISTORY_DIR, SESSION);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), contents);
}

function writeTranscript(lines: object[]): string {
  const file = path.join(TRANSCRIPTS, `${SESSION}.jsonl`);
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

beforeEach(() => {
  posted = [];
  openCheckpointDiff.mockClear();
  restoreCheckpoint.mockClear();
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(FILE_HISTORY_DIR, { recursive: true });
  fs.mkdirSync(TRANSCRIPTS, { recursive: true });
});

describe("handleCheckpointsMessage — routing", () => {
  it("declines a message belonging to another feature", async () => {
    expect(await handleCheckpointsMessage({ type: "getMcpServers" }, makeCtx())).toBe(
      false,
    );
    expect(posted).toEqual([]);
  });

  it("declines a malformed message that is not ours", async () => {
    expect(await handleCheckpointsMessage({ type: "nonsense" }, makeCtx())).toBe(false);
  });

  it("claims and rejects a malformed message that IS ours", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // `getCheckpoints` requires a sessionId; without one the schema rejects it.
    expect(await handleCheckpointsMessage({ type: "getCheckpoints" }, makeCtx())).toBe(
      true,
    );
    expect(posted).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("handleCheckpointsMessage — getCheckpointSessions", () => {
  it("posts the session summaries", async () => {
    writeBlob("aaaaaaaaaaaaaaaa@v1", "x");
    await handleCheckpointsMessage({ type: "getCheckpointSessions" }, makeCtx());
    expect(posted).toHaveLength(1);
    expect(posted[0].type).toBe("checkpointSessions");
    const data = posted[0].data as Array<{ sessionId: string; label: string }>;
    expect(data.map((s) => s.sessionId)).toEqual([SESSION]);
  });

  it("labels a session from the host's cached list when it knows it", async () => {
    writeBlob("aaaaaaaaaaaaaaaa@v1", "x");
    await handleCheckpointsMessage(
      { type: "getCheckpointSessions" },
      makeCtx({ describeSession: () => ({ label: "Refactor auth", project: "api" }) }),
    );
    const data = posted[0].data as Array<{ label: string; project: string }>;
    expect(data[0]).toMatchObject({ label: "Refactor auth", project: "api" });
  });

  it("keeps the short id when the host no longer knows the session", async () => {
    writeBlob("aaaaaaaaaaaaaaaa@v1", "x");
    await handleCheckpointsMessage({ type: "getCheckpointSessions" }, makeCtx());
    const data = posted[0].data as Array<{ label: string }>;
    expect(data[0].label).toBe(SESSION.slice(0, 8));
  });

  it("posts an empty list when nothing has checkpoints", async () => {
    await handleCheckpointsMessage({ type: "getCheckpointSessions" }, makeCtx());
    expect(posted[0].data).toEqual([]);
  });

  it("does nothing when the view is not resolved", async () => {
    const handled = await handleCheckpointsMessage(
      { type: "getCheckpointSessions" },
      makeCtx({ getWebview: () => undefined }),
    );
    expect(handled).toBe(true);
    expect(posted).toEqual([]);
  });
});

describe("handleCheckpointsMessage — getCheckpoints", () => {
  it("posts the session's files with its orphan count", async () => {
    const hash = hashFilePath(FILE);
    writeBlob(`${hash}@v1`, "one");
    writeBlob("cccccccccccccccc@v1", "orphan");
    const transcript = writeTranscript([
      {
        type: "file-history-snapshot",
        snapshot: {
          timestamp: "2026-09-11T19:02:13.560Z",
          trackedFileBackups: {
            [FILE]: {
              backupFileName: `${hash}@v1`,
              version: 1,
              backupTime: "2026-09-11T19:02:13.560Z",
              realParentDir: "/proj/src",
            },
          },
        },
      },
    ]);

    await handleCheckpointsMessage(
      { type: "getCheckpoints", sessionId: SESSION },
      makeCtx({ transcriptPath: () => transcript }),
    );

    expect(posted[0].type).toBe("checkpoints");
    expect(posted[0].sessionId).toBe(SESSION);
    expect(posted[0].orphanCount).toBe(1);
    const files = posted[0].data as Array<{ path: string; availableCount: number }>;
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: FILE, availableCount: 1 });
  });

  it("posts an empty file list when the transcript has no snapshot lines", async () => {
    const transcript = writeTranscript([
      { type: "user", message: { role: "user", content: "hi" } },
    ]);
    await handleCheckpointsMessage(
      { type: "getCheckpoints", sessionId: SESSION },
      makeCtx({ transcriptPath: () => transcript }),
    );
    expect(posted[0].data).toEqual([]);
  });

  it("degrades to an empty list when the transcript is gone", async () => {
    writeBlob("aaaaaaaaaaaaaaaa@v1", "x");
    await handleCheckpointsMessage(
      { type: "getCheckpoints", sessionId: SESSION },
      makeCtx(),
    );
    expect(posted[0].data).toEqual([]);
    expect(posted[0].orphanCount).toBe(1);
  });
});

describe("handleCheckpointsMessage — actions", () => {
  it("routes a diff request to the diff command", async () => {
    expect(
      await handleCheckpointsMessage(
        { type: "diffCheckpoint", sessionId: SESSION, filePath: FILE, version: 2 },
        makeCtx(),
      ),
    ).toBe(true);
    expect(openCheckpointDiff).toHaveBeenCalledWith(SESSION, FILE, 2);
  });

  it("routes a restore request to the restore command", async () => {
    expect(
      await handleCheckpointsMessage(
        { type: "restoreCheckpoint", sessionId: SESSION, filePath: FILE, version: 2 },
        makeCtx(),
      ),
    ).toBe(true);
    expect(restoreCheckpoint).toHaveBeenCalledWith(SESSION, FILE, 2);
  });

  it("acts on a restore even when the view has been disposed", async () => {
    // The user clicked; the panel closing mid-flight must not silently drop
    // the action they already confirmed intent for.
    await handleCheckpointsMessage(
      { type: "restoreCheckpoint", sessionId: SESSION, filePath: FILE, version: 1 },
      makeCtx({ getWebview: () => undefined }),
    );
    expect(restoreCheckpoint).toHaveBeenCalledTimes(1);
  });
});
