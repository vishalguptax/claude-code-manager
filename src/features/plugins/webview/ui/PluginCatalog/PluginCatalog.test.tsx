// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { availablePlugin, snapshot } from "../../__tests__/fixtures";
import { _resetPluginsState, applyPluginsData, catalogQuery } from "../../model";
import { PluginCatalog } from "./PluginCatalog";

beforeEach(() => _resetPluginsState());
afterEach(() => _resetPluginsState());

/** Rendered rows, headings marked with `#`. */
function rows(container: Element): string[] {
  return [...container.querySelectorAll(".group-label, .plg-item-name")].map((n) =>
    n.classList.contains("group-label") ? `# ${n.textContent}` : (n.textContent ?? ""),
  );
}

describe("PluginCatalog", () => {
  it("groups what the marketplaces offer under each marketplace", () => {
    applyPluginsData(snapshot());
    const { container } = render(<PluginCatalog onBack={vi.fn()} onSelect={vi.fn()} />);
    expect(rows(container)).toEqual(["# claude-plugins-official", "swift-lsp", "# caveman", "caveman"]);
    expect(screen.getByText("2 plugins")).toBeTruthy();
  });

  it("narrows by search and keeps the query for the next visit", async () => {
    applyPluginsData(snapshot());
    const { container } = render(<PluginCatalog onBack={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.input(screen.getByLabelText("Search available plugins"), {
      target: { value: "caveman" },
    });
    await waitFor(() => expect(rows(container)).toEqual(["# caveman", "caveman"]));
    expect(catalogQuery.value).toBe("caveman");
  });

  it("says so when nothing matches", () => {
    applyPluginsData(snapshot());
    catalogQuery.value = "zzz-nothing";
    render(<PluginCatalog onBack={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText("No matching plugins")).toBeTruthy();
  });

  it("explains how to get a catalog when no marketplace is added", () => {
    applyPluginsData(snapshot({ available: [] }));
    render(<PluginCatalog onBack={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText("No marketplaces to browse")).toBeTruthy();
    expect(screen.queryByLabelText("Search available plugins")).toBeNull();
  });

  // The official marketplace alone lists hundreds of plugins.
  it("windows a long catalog through the shared virtual list", () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      availablePlugin({ id: `p${i}@claude-plugins-official`, name: `p${i}` }),
    );
    applyPluginsData(snapshot({ available: many }));
    const { container } = render(<PluginCatalog onBack={vi.fn()} onSelect={vi.fn()} />);
    expect(container.querySelector(".virtual-list")).toBeTruthy();
    expect(container.querySelectorAll(".plg-item").length).toBeLessThan(120);
  });

  it("goes back, and opens a plugin", () => {
    applyPluginsData(snapshot());
    const onBack = vi.fn();
    const onSelect = vi.fn();
    render(<PluginCatalog onBack={onBack} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("swift-lsp"));
    fireEvent.click(screen.getByText("Plugins"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "swift-lsp@claude-plugins-official" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
