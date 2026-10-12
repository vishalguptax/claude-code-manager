import { afterEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("../../../webview/shared/hooks", () => ({
  useApi: () => ({ post: (m: unknown) => post(m) }),
  setVscodeApi: vi.fn(),
}));

import * as api from "./api";

afterEach(() => post.mockClear());

describe("sessions api senders", () => {
  it("sendReady posts ready", () => {
    api.sendReady();
    expect(post).toHaveBeenCalledWith({ type: "ready" });
  });

  it("sendResumeSession includes entrypoint and project", () => {
    api.sendResumeSession("id", "cli", "/p");
    expect(post).toHaveBeenCalledWith({
      type: "resumeSession",
      sessionId: "id",
      entrypoint: "cli",
      projectPath: "/p",
    });
  });

  it("sendGetSessionDetail defaults mode to last and query empty", () => {
    api.sendGetSessionDetail("id");
    expect(post).toHaveBeenCalledWith({
      type: "getSessionDetail",
      sessionId: "id",
      mode: "last",
      query: "",
    });
  });

  it("explorer senders carry what the host needs", () => {
    api.sendFileSessions(["a"], "auth");
    expect(post).toHaveBeenCalledWith({ type: "fileSessions", sessionIds: ["a"], folder: "auth" });
    api.sendCreateFolder();
    expect(post).toHaveBeenCalledWith({ type: "createFolder" });
    api.sendCreateFolder(["a"]);
    expect(post).toHaveBeenCalledWith({ type: "createFolder", sessionIds: ["a"] });
    api.sendOpenExplorer();
    expect(post).toHaveBeenCalledWith({ type: "openExplorer" });
  });

  it("sendOpenSessionPanel names the session", () => {
    api.sendOpenSessionPanel("id");
    expect(post).toHaveBeenCalledWith({ type: "openSessionPanel", sessionId: "id" });
  });

  it("folder senders carry the session ids or the folder name", () => {
    api.sendMoveToFolder(["a", "b"]);
    expect(post).toHaveBeenCalledWith({ type: "moveToFolder", sessionIds: ["a", "b"] });
    api.sendRenameFolder("auth");
    expect(post).toHaveBeenCalledWith({ type: "renameFolder", folder: "auth" });
    api.sendRemoveFolder("auth");
    expect(post).toHaveBeenCalledWith({ type: "removeFolder", folder: "auth" });
  });

  it("sendBulkPinSessions carries ids and pin flag", () => {
    api.sendBulkPinSessions(["a", "b"], true);
    expect(post).toHaveBeenCalledWith({ type: "bulkPinSessions", ids: ["a", "b"], pin: true });
  });

  it("sendSearchFullText posts the query", () => {
    api.sendSearchFullText("hello");
    expect(post).toHaveBeenCalledWith({ type: "searchFullText", query: "hello" });
  });

  it("sendConfirmDelete forwards an optional callback", () => {
    api.sendConfirmDelete("id", "cb");
    expect(post).toHaveBeenCalledWith({ type: "confirmDelete", sessionId: "id", callback: "cb" });
  });

  it("sendImportMultipleSessions posts the bulk-import request", () => {
    api.sendImportMultipleSessions();
    expect(post).toHaveBeenCalledWith({ type: "importMultipleSessions" });
  });

  it("sendCreateWorktree posts the recreate request with the session id", () => {
    api.sendCreateWorktree("sess-1");
    expect(post).toHaveBeenCalledWith({ type: "createWorktree", sessionId: "sess-1" });
  });
});
