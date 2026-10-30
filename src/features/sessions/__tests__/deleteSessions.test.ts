/**
 * deleteSessionsPermanently: what is confirmed, what is refused, and what
 * is cleaned up after. The file removal itself is pinned in
 * sessionFiles.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import type { Session } from "../types";

const m = vi.hoisted(() => ({
  live: new Set<string>(),
  deleteFiles: vi.fn(),
  forget: vi.fn(),
  clearPending: vi.fn(),
}));

vi.mock("../liveSessions", () => ({
  readLiveSessions: () => new Map([...m.live].map((id) => [id, {}])),
}));
vi.mock("../sessionFiles", () => ({ deleteSessionFiles: m.deleteFiles }));
vi.mock("../state", () => ({ forgetSessions: m.forget }));
vi.mock("../pendingRenames", () => ({ clearPendingRename: m.clearPending }));

import { deleteSessionsPermanently } from "../commands";

const A = "aaaaaaaa-1111-2222-3333-444444444444";
const B = "bbbbbbbb-1111-2222-3333-444444444444";
const sessions = [{ id: A, name: "Parser rewrite" } as Session, { id: B, name: "" } as Session];

let confirm: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  m.live.clear();
  m.deleteFiles.mockReset().mockImplementation((ids: string[]) => ({ deleted: ids, failed: [] }));
  m.forget.mockReset();
  m.clearPending.mockReset();
  confirm = vi
    .spyOn(vscode.window, "showWarningMessage")
    .mockResolvedValue("Delete Permanently" as never);
});

describe("deleteSessionsPermanently", () => {
  it("deletes after confirmation and forgets every trace of the session", async () => {
    expect(await deleteSessionsPermanently([A], sessions)).toEqual([A]);
    expect(confirm).toHaveBeenCalledWith(
      'Delete session "Parser rewrite" permanently?',
      expect.objectContaining({ modal: true, detail: expect.stringContaining("can't be undone") }),
      "Delete Permanently",
    );
    expect(m.deleteFiles).toHaveBeenCalledWith([A]);
    expect(m.forget).toHaveBeenCalledWith([A]);
    expect(m.clearPending).toHaveBeenCalledWith(A);
  });

  it("changes nothing when the user cancels", async () => {
    confirm.mockResolvedValue(undefined as never);
    expect(await deleteSessionsPermanently([A, B], sessions)).toEqual([]);
    expect(confirm).toHaveBeenCalledWith(
      "Delete 2 sessions permanently?",
      expect.anything(),
      "Delete Permanently",
    );
    expect(m.deleteFiles).not.toHaveBeenCalled();
    expect(m.forget).not.toHaveBeenCalled();
  });

  it("never deletes a running session, and says so", async () => {
    m.live.add(A);
    expect(await deleteSessionsPermanently([A], sessions)).toEqual([]);
    expect(confirm).toHaveBeenCalledWith(
      '"Parser rewrite" is still running. Exit Claude Code in its terminal first, then delete it.',
    );
    expect(m.deleteFiles).not.toHaveBeenCalled();
  });

  it("deletes the rest of a selection and names the running ones it left", async () => {
    m.live.add(A);
    expect(await deleteSessionsPermanently([A, B], sessions)).toEqual([B]);
    expect(confirm.mock.calls[0][0]).toBe("Delete session bbbbbbbb permanently?");
    expect((confirm.mock.calls[0][1] as { detail: string }).detail).toContain(
      "1 still running is left alone.",
    );
    expect(m.deleteFiles).toHaveBeenCalledWith([B]);
  });

  it("reports the sessions it could not delete and forgets only the rest", async () => {
    m.deleteFiles.mockReturnValue({ deleted: [B], failed: [{ sessionId: A, error: "EBUSY" }] });
    const error = vi.spyOn(vscode.window, "showErrorMessage");
    expect(await deleteSessionsPermanently([A, B], sessions)).toEqual([B]);
    expect(error).toHaveBeenCalledWith(`Couldn't delete every session. "Parser rewrite": EBUSY`);
    expect(m.forget).toHaveBeenCalledWith([B]);
  });

  it("warns when the prompts could not be removed from history", async () => {
    m.deleteFiles.mockReturnValue({ deleted: [A], failed: [], historyError: "EACCES" });
    await deleteSessionsPermanently([A], sessions);
    expect(confirm).toHaveBeenLastCalledWith(expect.stringMatching(/prompts are still in .*EACCES/));
  });
});
