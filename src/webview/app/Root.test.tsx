// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Root } from "./Root";

vi.mock("./App", () => ({ App: () => h("div", { class: "fake-app" }) }));
vi.mock("../../features/sessions/webview/panel", () => ({
  SessionPanel: ({ sessionId }: { sessionId: string }) =>
    h("div", { class: "fake-panel" }, sessionId),
}));
vi.mock("../../features/sessions/webview/explorer", () => ({
  SessionsExplorer: () => h("div", { class: "fake-explorer" }),
}));

afterEach(cleanup);

describe("Root", () => {
  it("renders the sidebar app when the document was not booted as a tab", () => {
    const { container } = render(h(Root, { view: undefined, sessionId: undefined }));
    expect(container.querySelector(".fake-app")).toBeTruthy();
  });

  it("shows the skeleton, then that session's tab once its code loads", async () => {
    const { container } = render(h(Root, { view: "session", sessionId: "s-1" }));
    expect(container.querySelector(".fake-app")).toBeNull();
    expect(container.querySelector(".skeleton-detail")).toBeTruthy();
    await waitFor(() => expect(container.querySelector(".fake-panel")?.textContent).toBe("s-1"));
    expect(container.querySelector(".skeleton-detail")).toBeNull();
  });

  it("loads the explorer for an explorer tab", async () => {
    const { container } = render(h(Root, { view: "explorer", sessionId: undefined }));
    await waitFor(() => expect(container.querySelector(".fake-explorer")).toBeTruthy());
  });

  it("falls back to the sidebar app for a session tab with no id", () => {
    const { container } = render(h(Root, { view: "session", sessionId: undefined }));
    expect(container.querySelector(".fake-app")).toBeTruthy();
  });
});
