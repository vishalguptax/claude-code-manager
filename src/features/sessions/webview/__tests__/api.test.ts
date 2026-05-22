import { afterEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("../../../../webview/shared/hooks", () => ({
  useApi: () => ({ post: (m: unknown) => post(m) }),
  setVscodeApi: vi.fn(),
}));

import * as api from "../api";

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
});
