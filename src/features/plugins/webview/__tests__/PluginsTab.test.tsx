// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import { _resetMessageBus, dispatch } from "../../../../webview/shared/model";
import type { PluginsData } from "../../types";
import { _resetPluginsState } from "../model";
import PluginsTab from "../index";
import { snapshot } from "./fixtures";

let posted: unknown[] = [];

/** Rendered plugin names. "caveman" is both a plugin and its marketplace, so
 *  a bare text query would match two nodes in one row. */
function names(): string[] {
  return [...document.querySelectorAll(".plg-item-name")].map((n) => n.textContent ?? "");
}

/**
 * The shared bus is typed against the protocol union, which does not carry
 * `pluginsData` until the wiring commit adds it. The cast is what the tab's
 * own handler does, so the test exercises the same path.
 */
function deliver(data: PluginsData): void {
  dispatch({ type: "pluginsData", data } as never);
}

beforeEach(() => {
  posted = [];
  setVscodeApi({ postMessage: (m) => posted.push(m) });
  _resetMessageBus();
  _resetPluginsState();
});

afterEach(() => {
  setVscodeApi(null);
  _resetMessageBus();
  _resetPluginsState();
});

describe("PluginsTab", () => {
  it("asks the host for a snapshot on mount", () => {
    render(h(PluginsTab, {}));
    expect(posted).toContainEqual({ type: "getPlugins" });
  });

  it("renders every plugin once the snapshot arrives", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(5));
    expect(screen.getByText("ui-ux-pro-max")).toBeTruthy();
  });

  it("counts the findings on the Issues segment", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => screen.getByText("Issues"));
    expect(screen.getByTitle("Issues: 4")).toBeTruthy();
    expect(screen.getByTitle("All: 5")).toBeTruthy();
  });

  it("narrows to the findings when Issues is selected", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => screen.getByText("Issues"));
    fireEvent.click(screen.getByText("Issues"));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));
    expect(names()).not.toContain("caveman");
    expect(names()).toContain("ui-ux-pro-max");
  });

  it("shows marketplaces and the policy block under Sources", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => screen.getByText("Sources"));
    fireEvent.click(screen.getByText("Sources"));
    await waitFor(() => expect(screen.getByText("JuliusBrussee/caveman")).toBeTruthy());
    expect(screen.getByText("strictKnownMarketplaces")).toBeTruthy();
  });

  it("sends an explicit scope when a row's switch is flipped", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => screen.getByLabelText("Disable caveman@caveman"));
    fireEvent.click(screen.getByLabelText("Disable caveman@caveman"));
    expect(posted).toContainEqual({
      type: "setPluginEnabled",
      id: "caveman@caveman",
      enabled: false,
      scope: "global",
    });
  });

  it("targets the deciding scope, not the user scope, for an overridden plugin", async () => {
    render(h(PluginsTab, {}));
    deliver(
      snapshot({
        plugins: [
          {
            ...snapshot().plugins[0],
            id: "layered@caveman",
            name: "layered",
            decidedBy: "local",
            declaredIn: [
              { scope: "global", enabled: true },
              { scope: "local", enabled: true },
            ],
          },
        ],
      }),
    );
    await waitFor(() => screen.getByLabelText("Disable layered@caveman"));
    fireEvent.click(screen.getByLabelText("Disable layered@caveman"));
    expect(posted).toContainEqual({
      type: "setPluginEnabled",
      id: "layered@caveman",
      enabled: false,
      scope: "local",
    });
  });

  it("opens the row's actions from the keyboard and offers every settings scope", async () => {
    const { container } = render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(names()).toContain("caveman"));
    const row = container.querySelector(".plg-item") as HTMLElement;
    fireEvent.keyDown(row, { key: "Enter" });
    await waitFor(() => screen.getByText("Copy plugin id"));
    expect(screen.getByText("Disable in user settings")).toBeTruthy();
    expect(screen.getByText("Open plugin folder")).toBeTruthy();
    expect(screen.getByText("Open user settings.json")).toBeTruthy();
    expect(screen.getByText("Open project settings.json")).toBeTruthy();
    expect(screen.getByText("Open local settings.json")).toBeTruthy();
  });

  it("does not offer a folder for a plugin with no install", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot({ plugins: [snapshot().plugins[2]] }));
    await waitFor(() => screen.getByText("claude-seo"));
    fireEvent.contextMenu(document.querySelector(".plg-item") as HTMLElement, {
      clientX: 10,
      clientY: 10,
    });
    await waitFor(() => screen.getByText("Copy plugin id"));
    expect(screen.queryByText("Open plugin folder")).toBeNull();
  });

  it("sends the scope the menu names when a settings file is opened", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(names()).toContain("caveman"));
    fireEvent.contextMenu(document.querySelector(".plg-item") as HTMLElement, {
      clientX: 10,
      clientY: 10,
    });
    await waitFor(() => screen.getByText("Open local settings.json"));
    fireEvent.click(screen.getByText("Open local settings.json"));
    expect(posted).toContainEqual({ type: "openPluginSettings", scope: "local" });
  });

  it("shows a clean empty state when nothing is installed", async () => {
    render(h(PluginsTab, {}));
    deliver({ plugins: [], marketplaces: [], policy: [], errors: [] });
    await waitFor(() => expect(screen.getByText("No plugins")).toBeTruthy());
  });

  it("congratulates an installation with no findings", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot({ plugins: [snapshot().plugins[0]] }));
    await waitFor(() => screen.getByText("Issues"));
    fireEvent.click(screen.getByText("Issues"));
    await waitFor(() => expect(screen.getByText("Nothing needs attention")).toBeTruthy());
  });

  it("surfaces a malformed settings file without hiding the list", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot({ errors: ["/repo/.claude/settings.json could not be read"] }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("filters the list as the user searches", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => screen.getByLabelText("Search plugins"));
    fireEvent.input(screen.getByLabelText("Search plugins"), {
      target: { value: "rogue" },
    });
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1), {
      timeout: 1000,
    });
    expect(screen.getByText("rogue")).toBeTruthy();
  });
});
