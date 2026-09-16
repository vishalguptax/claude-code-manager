// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginsApi } from "../../api";
import { _resetPluginsState, applyPluginsData, selectedPlugin, view } from "../../model";
import { snapshot } from "../../__tests__/fixtures";
import { ListView } from "./ListView";

function api(): PluginsApi {
  return {
    getPlugins: vi.fn(),
    openDirectory: vi.fn(),
    openSettings: vi.fn(),
    copyId: vi.fn(),
    setEnabled: vi.fn(),
  };
}

beforeEach(() => {
  _resetPluginsState();
});
afterEach(() => {
  _resetPluginsState();
});

describe("ListView", () => {
  it("roots the tab in the shared scrolling panel", () => {
    // `.tab-content .panel` (tabs.css) is what gives a tab its own scroll
    // region. Without the class the list cannot scroll inside the pane.
    const { container } = render(<ListView api={api()} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains("panel")).toBe(true);
  });

  it("puts the search field in the shared search row", () => {
    // `.search-row` carries the --space-2xl inset that lines the field up
    // with the row text beneath it; a bare field floats out of alignment.
    const { container } = render(<ListView api={api()} />);
    const row = container.querySelector(".search-row") as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.contains(screen.getByLabelText("Search plugins"))).toBe(true);
  });

  it("offers the view segments as a radio group with counts", () => {
    applyPluginsData(snapshot());
    render(<ListView api={api()} />);
    const group = screen.getByRole("radiogroup", { name: "Plugins view" });
    expect([...group.querySelectorAll('[role="radio"]')].map((r) => r.textContent)).toEqual([
      "All (5)",
      "Issues (4)",
      "Sources (2)",
    ]);
  });

  it("captions the list with its count", () => {
    applyPluginsData(snapshot());
    const { container } = render(<ListView api={api()} />);
    expect(container.querySelector(".list-count")?.textContent).toBe("5 plugins");
  });

  it("says one plugin, not 1 plugins", () => {
    applyPluginsData(snapshot({ plugins: [snapshot().plugins[0]] }));
    const { container } = render(<ListView api={api()} />);
    expect(container.querySelector(".list-count")?.textContent).toBe("1 plugin");
  });

  it("narrows to the findings when Issues is selected", async () => {
    applyPluginsData(snapshot());
    const { container } = render(<ListView api={api()} />);
    fireEvent.click(screen.getByText("Issues (4)"));
    await waitFor(() =>
      expect(container.querySelectorAll(".plg-item")).toHaveLength(4),
    );
  });

  it("shows the marketplaces and the policy keys under Sources", async () => {
    applyPluginsData(snapshot());
    const { container } = render(<ListView api={api()} />);
    fireEvent.click(screen.getByText("Sources (2)"));
    await waitFor(() => screen.getByText("JuliusBrussee/caveman"));
    expect([...container.querySelectorAll(".group-label")].map((l) => l.textContent)).toEqual([
      "Policy",
      "Marketplaces",
    ]);
    expect(screen.getByText("strictKnownMarketplaces")).toBeTruthy();
  });

  it("opens a plugin's detail view when its row is clicked", async () => {
    applyPluginsData(snapshot());
    const { container } = render(<ListView api={api()} />);
    fireEvent.click(container.querySelector(".plg-item") as HTMLElement);
    await waitFor(() => expect(selectedPlugin.value?.id).toBe("caveman@caveman"));
  });

  it("sends the deciding scope when a row's toggle is flipped", () => {
    applyPluginsData(snapshot());
    const a = api();
    render(<ListView api={a} />);
    fireEvent.click(screen.getByLabelText("Disable caveman@caveman"));
    expect(a.setEnabled).toHaveBeenCalledWith("caveman@caveman", false, "global");
  });

  it("refreshes on demand", () => {
    const a = api();
    render(<ListView api={a} />);
    fireEvent.click(screen.getByLabelText("Refresh plugins"));
    expect(a.getPlugins).toHaveBeenCalled();
  });

  it("opens the row's actions on right-click and routes the choice", async () => {
    applyPluginsData(snapshot());
    const a = api();
    const { container } = render(<ListView api={a} />);
    fireEvent.contextMenu(container.querySelector(".plg-item") as HTMLElement, {
      clientX: 10,
      clientY: 10,
    });
    await waitFor(() => screen.getByText("Open local settings.json"));
    fireEvent.click(screen.getByText("Open local settings.json"));
    expect(a.openSettings).toHaveBeenCalledWith("local");
  });

  it("shows a shared empty state when nothing is installed", () => {
    applyPluginsData({ plugins: [], marketplaces: [], policy: [], errors: [] });
    const { container } = render(<ListView api={api()} />);
    expect(container.querySelector(".empty-state")).toBeTruthy();
    expect(screen.getByText("No plugins")).toBeTruthy();
  });

  it("congratulates an installation with no findings", async () => {
    applyPluginsData(snapshot({ plugins: [snapshot().plugins[0]] }));
    view.value = "issues";
    const { container } = render(<ListView api={api()} />);
    await waitFor(() => expect(screen.getByText("Nothing needs attention")).toBeTruthy());
    expect(container.querySelector(".empty-state")).toBeTruthy();
  });

  it("shows a shared empty state when no marketplace is known", () => {
    applyPluginsData(snapshot({ marketplaces: [], policy: [] }));
    view.value = "sources";
    const { container } = render(<ListView api={api()} />);
    expect(container.querySelector(".empty-state")).toBeTruthy();
    expect(screen.getByText("No marketplaces")).toBeTruthy();
  });

  it("surfaces a malformed settings file without hiding the list", () => {
    applyPluginsData(snapshot({ errors: ["/repo/.claude/settings.json could not be read"] }));
    const { container } = render(<ListView api={api()} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(container.querySelectorAll(".plg-item")).toHaveLength(5);
  });

  it("filters the list as the user searches", async () => {
    applyPluginsData(snapshot());
    const { container } = render(<ListView api={api()} />);
    fireEvent.input(screen.getByLabelText("Search plugins"), { target: { value: "rogue" } });
    await waitFor(
      () => expect(container.querySelectorAll(".plg-item")).toHaveLength(1),
      { timeout: 1000 },
    );
    expect(screen.getByText("rogue")).toBeTruthy();
  });
});
