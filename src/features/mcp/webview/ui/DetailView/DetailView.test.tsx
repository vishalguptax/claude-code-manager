// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { McpServer } from "../../../types";
import { DetailView } from "./DetailView";

function srv(p: Partial<McpServer> & Pick<McpServer, "name" | "scope">): McpServer {
  return { type: "stdio", command: "node", ...p };
}

function handlers() {
  return {
    onBack: vi.fn(),
    onEdit: vi.fn(),
    onOpenConfig: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onCopyName: vi.fn(),
    onOpenClaude: vi.fn(),
    onAuthenticate: vi.fn(),
    onLogout: vi.fn(),
    onReconnect: vi.fn(),
    onCheckStatus: vi.fn(),
  };
}

describe("DetailView", () => {
  it("renders stdio command, args, and masked env vars", () => {
    render(
      h(DetailView, {
        server: srv({
          name: "files",
          scope: "project",
          args: ["serve", "--port"],
          env: { API_KEY: "abcdefghijkl" },
        }),
        ...handlers(),
      }),
    );
    expect(screen.getByText("files")).toBeTruthy();
    expect(screen.getByText("node")).toBeTruthy();
    expect(screen.getByText("serve --port")).toBeTruthy();
    expect(screen.getByText("API_KEY")).toBeTruthy();
    expect(screen.getByText("abcd****ijkl")).toBeTruthy();
  });

  it("renders the URL for http servers", () => {
    render(
      h(DetailView, {
        server: srv({ name: "r", scope: "global", type: "http", url: "https://x" }),
        ...handlers(),
      }),
    );
    expect(screen.getByText("https://x")).toBeTruthy();
  });

  it("renders the URL for sse and ws servers too, not just http", () => {
    render(
      h(DetailView, {
        server: srv({ name: "r", scope: "global", type: "sse", url: "https://legacy" }),
        ...handlers(),
      }),
    );
    expect(screen.getByText("https://legacy")).toBeTruthy();
    expect(screen.queryByText("Command")).toBeNull();
  });

  it("renders masked headers alongside env vars", () => {
    render(
      h(DetailView, {
        server: srv({
          name: "api",
          scope: "global",
          type: "http",
          url: "https://x",
          headers: { Authorization: "Bearer abcdefghijkl" },
        }),
        ...handlers(),
      }),
    );
    expect(screen.getByText("Headers")).toBeTruthy();
    expect(screen.getByText("Authorization")).toBeTruthy();
    expect(screen.getByText("Bear****ijkl")).toBeTruthy();
  });

  it("omits the Headers section when there are none", () => {
    render(h(DetailView, { server: srv({ name: "a", scope: "project" }), ...handlers() }));
    expect(screen.queryByText("Headers")).toBeNull();
  });

  it("wires back, toggle, config, and delete for editable servers", () => {
    const hnd = handlers();
    render(h(DetailView, { server: srv({ name: "a", scope: "project" }), ...hnd }));
    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(screen.getByText("Disable"));
    fireEvent.click(screen.getByText("Open Config"));
    fireEvent.click(screen.getByText("Delete"));
    expect(hnd.onBack).toHaveBeenCalledOnce();
    expect(hnd.onToggle).toHaveBeenCalledOnce();
    expect(hnd.onOpenConfig).toHaveBeenCalledOnce();
    expect(hnd.onDelete).toHaveBeenCalledOnce();
  });

  it("shows Enable when the server is disabled", () => {
    render(
      h(DetailView, {
        server: srv({ name: "a", scope: "project", disabled: true }),
        ...handlers(),
      }),
    );
    expect(screen.getByText("Enable")).toBeTruthy();
  });

  it("hides the toggle and shows a note for global servers (no Claude Code disable)", () => {
    render(
      h(DetailView, { server: srv({ name: "g", scope: "global" }), ...handlers() }),
    );
    expect(screen.queryByText("Disable")).toBeNull();
    expect(screen.queryByText("Enable")).toBeNull();
    // Delete + Open Config still available for global servers.
    expect(screen.getByText("Delete")).toBeTruthy();
    expect(screen.getByText("Open Config")).toBeTruthy();
    expect(screen.getByText(/User-scope servers can't be enabled\/disabled/)).toBeTruthy();
  });

  it("shows the toggle for project servers", () => {
    render(h(DetailView, { server: srv({ name: "p", scope: "project" }), ...handlers() }));
    expect(screen.getByText("Disable")).toBeTruthy();
  });

  it("hides edit actions and shows a note for plugin servers", () => {
    render(
      h(DetailView, {
        server: srv({ name: "p", scope: "plugin", pluginName: "p@m" }),
        ...handlers(),
      }),
    );
    expect(screen.queryByText("Disable")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
    expect(screen.queryByText("Open Config")).toBeNull();
    expect(screen.getByText(/Owned by plugin/)).toBeTruthy();
  });

  it("copies the name and flashes 'Copied!'", () => {
    const hnd = handlers();
    render(h(DetailView, { server: srv({ name: "a", scope: "project" }), ...hnd }));
    fireEvent.click(screen.getByText("Copy Name"));
    expect(hnd.onCopyName).toHaveBeenCalledWith("a");
    expect(screen.getByText("Copied!")).toBeTruthy();
  });

  it("fires onOpenClaude", () => {
    const hnd = handlers();
    render(h(DetailView, { server: srv({ name: "a", scope: "project" }), ...hnd }));
    fireEvent.click(screen.getByText("Open Claude"));
    expect(hnd.onOpenClaude).toHaveBeenCalledOnce();
  });

  it("wires edit, authenticate, clear-auth, and reconnect actions", () => {
    const hnd = handlers();
    render(h(DetailView, { server: srv({ name: "api", scope: "project" }), ...hnd }));
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByText("Authenticate"));
    fireEvent.click(screen.getByText("Clear Auth"));
    fireEvent.click(screen.getByText("Reconnect"));
    expect(hnd.onEdit).toHaveBeenCalledOnce();
    expect(hnd.onAuthenticate).toHaveBeenCalledWith("api");
    expect(hnd.onLogout).toHaveBeenCalledWith("api");
    expect(hnd.onReconnect).toHaveBeenCalledOnce();
  });

  it("shows Check Status only for url-transport servers", () => {
    const hnd = handlers();
    const { rerender } = render(
      h(DetailView, { server: srv({ name: "s", scope: "project" }), ...hnd }),
    );
    expect(screen.queryByText("Check Status")).toBeNull(); // stdio
    rerender(h(DetailView, { server: srv({ name: "s", scope: "global", type: "http", url: "https://x" }), ...hnd }));
    fireEvent.click(screen.getByText("Check Status"));
    expect(hnd.onCheckStatus).toHaveBeenCalledOnce();
  });

  it("reveals masked secret values when the eye toggle is clicked", () => {
    render(
      h(DetailView, {
        server: srv({ name: "a", scope: "project", env: { API_KEY: "abcdefghijkl" } }),
        ...handlers(),
      }),
    );
    expect(screen.getByText("abcd****ijkl")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Reveal secret values"));
    expect(screen.getByText("abcdefghijkl")).toBeTruthy();
  });

  it("shows a red health dot when a stdio command is missing from PATH", () => {
    const { container } = render(
      h(DetailView, {
        server: srv({ name: "a", scope: "project", commandAvailable: false }),
        ...handlers(),
      }),
    );
    expect(container.querySelector(".mcp-health-dot.is-missing")).toBeTruthy();
  });
});
