// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { McpServer } from "../../../types";
import { applyServers, resetMcpSignals, searchQuery, selected } from "../../model";
import { ListView } from "./ListView";

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

  it("shows a parse-error banner above the list while still rendering servers", () => {
    applyServers([srv({ name: "a", scope: "project" })], ["Failed to parse .mcp.json: bad"]);
    render(h(ListView, props()));
    expect(screen.getByText("Failed to parse .mcp.json: bad")).toBeTruthy();
    expect(screen.getByText("a")).toBeTruthy();
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

  it("fires browse and refresh from the side actions", () => {
    const p = props();
    applyServers([srv({ name: "alpha", scope: "project" })]);
    render(h(ListView, p));
    fireEvent.click(screen.getByLabelText("Browse MCP servers"));
    fireEvent.click(screen.getByLabelText("Refresh MCP servers"));
    expect(p.onBrowse).toHaveBeenCalledOnce();
    expect(p.onRefresh).toHaveBeenCalledOnce();
  });

  it("filters the visible list by the scope filter", () => {
    applyServers([srv({ name: "alpha", scope: "project" }), srv({ name: "beta", scope: "global" })]);
    render(h(ListView, props()));
    fireEvent.click(screen.getByText("Global (1)"));
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.queryByText("alpha")).toBeNull();
  });

  it("omits the plugin scope segment when no plugin servers exist", () => {
    applyServers([srv({ name: "alpha", scope: "project" })]);
    render(h(ListView, props()));
    expect(screen.queryByText(/Plugin/)).toBeNull();
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

describe("ListView search", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    resetMcpSignals();
  });

  it("writes the lowercased query to the signal after the debounce window", () => {
    applyServers([srv({ name: "alpha", scope: "project" }), srv({ name: "beta", scope: "global" })]);
    const { container } = render(h(ListView, props()));
    const field = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(field, { target: { value: "ALP" } });
    // Within the debounce window the signal has not been written yet.
    expect(searchQuery.value).toBe("");
    vi.advanceTimersByTime(200);
    // The filter signal is lowercased so search is case-insensitive.
    expect(searchQuery.value).toBe("alp");
  });
});
