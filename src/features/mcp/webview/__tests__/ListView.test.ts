// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { McpServer } from "../../types";
import { applyServers, resetMcpSignals, searchQuery, selected } from "../signals";
import { ListView, buildRows } from "../views/ListView";

function srv(p: Partial<McpServer> & Pick<McpServer, "name" | "scope">): McpServer {
  return { type: "stdio", command: "node", ...p };
}

function props() {
  return {
    onSelect: vi.fn(),
    onCopyName: vi.fn(),
    onBrowse: vi.fn(),
    onRefresh: vi.fn(),
  };
}

afterEach(() => resetMcpSignals());

describe("buildRows", () => {
  it("interleaves a group-label row before each new scope group", () => {
    const rows = buildRows([
      srv({ name: "a", scope: "project" }),
      srv({ name: "b", scope: "global" }),
      srv({ name: "c", scope: "global" }),
    ]);
    expect(rows.map((r) => (r.kind === "label" ? `L:${r.label}` : `I:${r.server.name}`))).toEqual([
      "L:Project Servers",
      "I:a",
      "L:Global Servers",
      "I:b",
      "I:c",
    ]);
  });
});

describe("ListView", () => {
  it("renders the full empty state when no servers exist", () => {
    render(h(ListView, props()));
    expect(screen.getByText("No MCP servers configured")).toBeTruthy();
  });

  it("renders grouped servers with a count", () => {
    applyServers([srv({ name: "a", scope: "project" }), srv({ name: "b", scope: "global" })]);
    render(h(ListView, props()));
    expect(screen.getByText("2 servers")).toBeTruthy();
    expect(screen.getByText("Project Servers")).toBeTruthy();
    expect(screen.getByText("Global Servers")).toBeTruthy();
  });

  it("shows a 'no matching servers' message when the query excludes everything", () => {
    applyServers([srv({ name: "alpha", scope: "project" })]);
    searchQuery.value = "zzz";
    render(h(ListView, props()));
    expect(screen.getByText("No matching servers")).toBeTruthy();
  });

  it("selects a server when its row is clicked", () => {
    const p = props();
    applyServers([srv({ name: "alpha", scope: "project" })]);
    render(h(ListView, p));
    fireEvent.click(screen.getByText("alpha"));
    expect(p.onSelect).toHaveBeenCalledOnce();
  });

  it("updating the search input narrows the visible list via the signal", () => {
    applyServers([
      srv({ name: "alpha", scope: "project" }),
      srv({ name: "beta", scope: "global" }),
    ]);
    render(h(ListView, props()));
    fireEvent.input(screen.getByLabelText("Search MCP servers"), {
      target: { value: "alp" },
    });
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.queryByText("beta")).toBeNull();
  });

  it("virtualizes when more than 50 servers are present", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      srv({ name: `srv-${String(i).padStart(2, "0")}`, scope: "project" }),
    );
    applyServers(many);
    const { container } = render(h(ListView, props()));
    expect(container.querySelector(".mcp-virtual")).toBeTruthy();
    expect(container.querySelectorAll(".mcp-item").length).toBeLessThan(60);
  });

  it("marks the selected server row active", () => {
    const target = srv({ name: "alpha", scope: "project" });
    applyServers([target]);
    selected.value = target;
    const { container } = render(h(ListView, props()));
    expect(container.querySelector(".mcp-item.active")).toBeTruthy();
  });
});
