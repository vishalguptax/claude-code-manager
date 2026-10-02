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

  // Occasional actions live behind the "More" overflow menu.
  const openMore = (): void => {
    fireEvent.click(screen.getByText("More"));
  };

  it("wires back, toggle, and delete (primary) for editable servers", () => {
    const hnd = handlers();
    render(h(DetailView, { server: srv({ name: "a", scope: "project" }), ...hnd }));
    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(screen.getByText("Disable"));
    fireEvent.click(screen.getByText("Delete"));
    expect(hnd.onBack).toHaveBeenCalledOnce();
    expect(hnd.onToggle).toHaveBeenCalledOnce();
    expect(hnd.onDelete).toHaveBeenCalledOnce();
  });

  it("wires Open Config from the More menu", () => {
    const hnd = handlers();
    render(h(DetailView, { server: srv({ name: "a", scope: "project" }), ...hnd }));
    openMore();
    fireEvent.click(screen.getByText("Open Config"));
    expect(hnd.onOpenConfig).toHaveBeenCalledOnce();
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

  it("offers the per-project toggle for global and local servers", () => {
    // `/mcp` switches a user or local server off for one project via
    // disabledMcpServers, so the button is a real Claude Code action.
    for (const scope of ["global", "local"] as const) {
      const hnd = handlers();
      const { unmount } = render(
        h(DetailView, { server: srv({ name: "g", scope, disabled: true }), ...hnd }),
      );
      fireEvent.click(screen.getByText("Enable"));
      expect(hnd.onToggle).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Delete")).toBeTruthy();
      unmount();
    }
  });

  it("explains, instead of offering a switch, for a legacy-file server", () => {
    render(
      h(DetailView, { server: srv({ name: "old", scope: "global", legacyFile: true }), ...handlers() }),
    );
    expect(screen.queryByText("Disable")).toBeNull();
    expect(screen.getByText(/which Claude Code does not read/)).toBeTruthy();
  });

  it("names the shared ancestor file a project server comes from", () => {
    render(
      h(DetailView, {
        server: srv({ name: "up", scope: "project", ancestorFile: "/home/me/.mcp.json" }),
        ...handlers(),
      }),
    );
    expect(screen.getByText("/home/me/.mcp.json")).toBeTruthy();
    expect(screen.getByText(/outside this workspace/)).toBeTruthy();
  });

  it("labels a local server with the local scope badge", () => {
    render(h(DetailView, { server: srv({ name: "l", scope: "local" }), ...handlers() }));
    const badge = screen.getByText("local");
    expect(badge.classList.contains("vsc-badge--scope-local")).toBe(true);
  });

  it("shows the toggle for project servers", () => {
    render(h(DetailView, { server: srv({ name: "p", scope: "project" }), ...handlers() }));
    expect(screen.getByText("Disable")).toBeTruthy();
  });

  it("hides edit/delete and shows a note for plugin servers", () => {
    render(
      h(DetailView, {
        server: srv({ name: "p", scope: "plugin", pluginName: "p@m" }),
        ...handlers(),
      }),
    );
    expect(screen.queryByText("Edit")).toBeNull();
    // The per-project switch stays: it lives in the project's config.
    expect(screen.getByText("Disable")).toBeTruthy();
    expect(screen.queryByText("Delete")).toBeNull();
    expect(screen.getByText(/Owned by plugin/)).toBeTruthy();
  });

  it("copies the name from the More menu", () => {
    const hnd = handlers();
    render(h(DetailView, { server: srv({ name: "a", scope: "project" }), ...hnd }));
    openMore();
    fireEvent.click(screen.getByText("Copy Name"));
    expect(hnd.onCopyName).toHaveBeenCalledWith("a");
  });

  it("fires onOpenClaude from the More menu", () => {
    const hnd = handlers();
    render(h(DetailView, { server: srv({ name: "a", scope: "project" }), ...hnd }));
    openMore();
    fireEvent.click(screen.getByText("Open Claude"));
    expect(hnd.onOpenClaude).toHaveBeenCalledOnce();
  });

  it("wires Edit (primary) and authenticate/clear-auth/reconnect (More menu)", () => {
    const hnd = handlers();
    // url transport — auth (OAuth) only applies to remote servers.
    render(
      h(DetailView, { server: srv({ name: "api", scope: "global", type: "http", url: "https://x" }), ...hnd }),
    );
    fireEvent.click(screen.getByText("Edit"));
    expect(hnd.onEdit).toHaveBeenCalledOnce();
    openMore();
    fireEvent.click(screen.getByText("Authenticate"));
    openMore();
    fireEvent.click(screen.getByText("Clear Auth"));
    openMore();
    fireEvent.click(screen.getByText("Reconnect (/mcp)"));
    expect(hnd.onAuthenticate).toHaveBeenCalledWith("api");
    expect(hnd.onLogout).toHaveBeenCalledWith("api");
    expect(hnd.onReconnect).toHaveBeenCalledOnce();
  });

  it("hides Authenticate / Clear Auth for stdio servers (OAuth is url-only)", () => {
    render(h(DetailView, { server: srv({ name: "s", scope: "project" }), ...handlers() }));
    openMore();
    expect(screen.queryByText("Authenticate")).toBeNull();
    expect(screen.queryByText("Clear Auth")).toBeNull();
  });

  it("offers Check Status in the More menu only for url-transport servers", () => {
    const hnd = handlers();
    const { rerender } = render(
      h(DetailView, { server: srv({ name: "s", scope: "project" }), ...hnd }),
    );
    openMore();
    expect(screen.queryByText("Check Status")).toBeNull(); // stdio
    rerender(h(DetailView, { server: srv({ name: "s", scope: "global", type: "http", url: "https://x" }), ...hnd }));
    openMore();
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
