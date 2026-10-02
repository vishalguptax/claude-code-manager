// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { MCP_CATALOG } from "../../lib";
import { McpCatalog, type McpCatalogProps } from "./McpCatalog";

function props(overrides: Partial<McpCatalogProps> = {}): McpCatalogProps {
  return {
    configured: new Set<string>(),
    onBack: vi.fn(),
    onAdd: vi.fn(),
    onOpenExisting: vi.fn(),
    onOpenUrl: vi.fn(),
    onBrowseMore: vi.fn(),
    ...overrides,
  };
}

describe("McpCatalog", () => {
  it("lists every catalog server with its description", () => {
    const { container } = render(h(McpCatalog, props()));
    expect(container.querySelectorAll(".mcp-item").length).toBe(MCP_CATALOG.length);
    expect(screen.getByText("Playwright")).toBeTruthy();
    expect(
      screen.getByText("Drive a real browser: navigate, click, fill forms, read pages."),
    ).toBeTruthy();
  });

  it("hands the chosen entry to onAdd", () => {
    const p = props();
    render(h(McpCatalog, p));
    fireEvent.click(screen.getByText("Sentry"));
    expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "sentry" }));
    expect(p.onOpenExisting).not.toHaveBeenCalled();
  });

  it("marks a configured server as added and opens it instead of adding it again", () => {
    const p = props({ configured: new Set(["sentry"]) });
    render(h(McpCatalog, p));
    expect(screen.getByText("added")).toBeTruthy();
    fireEvent.click(screen.getByText("Sentry"));
    expect(p.onOpenExisting).toHaveBeenCalledWith("sentry");
    expect(p.onAdd).not.toHaveBeenCalled();
  });

  it("shows what a server needs, but not once it is added", () => {
    const { rerender } = render(h(McpCatalog, props()));
    expect(screen.getByText("Reads GITHUB_PERSONAL_ACCESS_TOKEN from your environment.")).toBeTruthy();
    rerender(h(McpCatalog, props({ configured: new Set(["github"]) })));
    expect(screen.queryByText("Reads GITHUB_PERSONAL_ACCESS_TOKEN from your environment.")).toBeNull();
  });

  it("opens a server's setup docs without adding it", () => {
    const p = props();
    render(h(McpCatalog, p));
    fireEvent.click(screen.getByLabelText("Open Playwright setup docs"));
    expect(p.onOpenUrl).toHaveBeenCalledWith("https://github.com/microsoft/playwright-mcp");
    expect(p.onAdd).not.toHaveBeenCalled();
  });

  it("filters by search and says so when nothing matches", async () => {
    const { container } = render(h(McpCatalog, props()));
    const input = screen.getByLabelText("Search MCP catalog");
    fireEvent.input(input, { target: { value: "linear" } });
    await waitFor(() => expect(container.querySelectorAll(".mcp-item").length).toBe(1));
    fireEvent.input(input, { target: { value: "zzz-no-such-server" } });
    await waitFor(() => expect(screen.getByText("No matching servers")).toBeTruthy());
  });

  it("goes back, and links out for servers beyond the catalog", () => {
    const p = props();
    render(h(McpCatalog, p));
    fireEvent.click(screen.getByText("MCP servers"));
    fireEvent.click(screen.getByText("Find more servers"));
    expect(p.onBack).toHaveBeenCalledOnce();
    expect(p.onBrowseMore).toHaveBeenCalledOnce();
  });
});
