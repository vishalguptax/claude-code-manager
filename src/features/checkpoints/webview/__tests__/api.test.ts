import { beforeEach, describe, expect, it } from "vitest";
import { createCheckpointsApi } from "../api";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";
const FILE = "/proj/src/a.ts";

let posted: unknown[];
let api: ReturnType<typeof createCheckpointsApi>;

beforeEach(() => {
  posted = [];
  api = createCheckpointsApi((m) => posted.push(m));
});

describe("createCheckpointsApi", () => {
  it("requests the session list", () => {
    api.getSessions();
    expect(posted).toEqual([{ type: "getCheckpointSessions" }]);
  });

  it("requests one session's checkpoints", () => {
    api.getCheckpoints(SESSION);
    expect(posted).toEqual([{ type: "getCheckpoints", sessionId: SESSION }]);
  });

  it("asks for a diff by file and version, never by blob name", () => {
    api.diff(SESSION, FILE, 3);
    expect(posted).toEqual([
      { type: "diffCheckpoint", sessionId: SESSION, filePath: FILE, version: 3 },
    ]);
    // The blob grammar stays host-side; nothing here can name a file in the
    // history tree.
    expect(JSON.stringify(posted)).not.toContain("@v");
  });

  it("asks for a restore by file and version", () => {
    api.restore(SESSION, FILE, 3);
    expect(posted).toEqual([
      { type: "restoreCheckpoint", sessionId: SESSION, filePath: FILE, version: 3 },
    ]);
  });

  it("reuses the shared openFile message", () => {
    api.openFile(FILE);
    expect(posted).toEqual([{ type: "openFile", path: FILE }]);
  });

  it("validates before posting — a bad version never leaves the webview", () => {
    // parseMessage is the gate: a non-numeric version fails here rather than
    // being silently dropped by the host.
    expect(() =>
      api.diff(SESSION, FILE, "3" as unknown as number),
    ).toThrow();
    expect(posted).toEqual([]);
  });
});
