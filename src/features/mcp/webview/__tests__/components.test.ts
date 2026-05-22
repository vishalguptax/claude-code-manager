// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import {
  DisabledBadge,
  ReadOnlyBadge,
  ScopeBadge,
  TypeBadge,
} from "../components/McpBadges";
import { McpEmpty } from "../components/McpEmpty";
import { McpSearchBar } from "../components/McpSearchBar";
import { ScopeFilter } from "../components/ScopeFilter";

describe("McpBadges", () => {
  it("renders each badge with its label and class", () => {
    const { container } = render(
      h("div", null, [
        h(TypeBadge, { type: "http" }),
        h(ScopeBadge, { scope: "plugin" }),
        h(DisabledBadge, {}),
        h(ReadOnlyBadge, { pluginName: "p@m" }),
      ]),
    );
    expect(container.querySelector(".mcp-type-http")?.textContent).toBe("http");
    expect(container.querySelector(".mcp-scope-plugin")?.textContent).toBe("plugin");
    expect(screen.getByText("disabled")).toBeTruthy();
    expect(screen.getByTitle("Owned by plugin p@m")).toBeTruthy();
  });
});

describe("McpEmpty", () => {
  it("renders the browse link and fires onBrowse", () => {
    const onBrowse = vi.fn();
    render(h(McpEmpty, { onBrowse }));
    fireEvent.click(screen.getByText("Browse MCP servers →"));
    expect(onBrowse).toHaveBeenCalledOnce();
  });
});

describe("McpSearchBar", () => {
  it("emits query changes on input", () => {
    const onQueryChange = vi.fn();
    render(
      h(McpSearchBar, { query: "", onQueryChange, onBrowse: vi.fn(), onRefresh: vi.fn() }),
    );
    fireEvent.input(screen.getByLabelText("Search MCP servers"), {
      target: { value: "abc" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("abc");
  });

  it("clears the query on Escape and via the clear button", () => {
    const onQueryChange = vi.fn();
    render(
      h(McpSearchBar, { query: "abc", onQueryChange, onBrowse: vi.fn(), onRefresh: vi.fn() }),
    );
    fireEvent.keyDown(screen.getByLabelText("Search MCP servers"), { key: "Escape" });
    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  it("fires browse and refresh", () => {
    const onBrowse = vi.fn();
    const onRefresh = vi.fn();
    render(h(McpSearchBar, { query: "", onQueryChange: vi.fn(), onBrowse, onRefresh }));
    fireEvent.click(screen.getByLabelText("Browse MCP servers"));
    fireEvent.click(screen.getByLabelText("Refresh MCP servers"));
    expect(onBrowse).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

describe("ScopeFilter", () => {
  it("omits the plugin button when no plugin servers exist", () => {
    render(
      h(ScopeFilter, {
        active: "all",
        total: 2,
        counts: { project: 1, global: 1, plugin: 0 },
        onChange: vi.fn(),
      }),
    );
    expect(screen.queryByText(/Plugin/)).toBeNull();
    expect(screen.getByText("All (2)")).toBeTruthy();
  });

  it("shows the plugin button and reports changes", () => {
    const onChange = vi.fn();
    render(
      h(ScopeFilter, {
        active: "all",
        total: 3,
        counts: { project: 1, global: 1, plugin: 1 },
        onChange,
      }),
    );
    fireEvent.click(screen.getByText("Plugin (1)"));
    expect(onChange).toHaveBeenCalledWith("plugin");
  });
});
