// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import {
  _resetMessageBus,
  _resetPaletteSources,
  activeTab,
  collectPaletteItems,
  dispatch,
} from "../../../../webview/shared/model";
import type { PluginsData } from "../../types";
import { _resetPluginsState, selectedPlugin } from "../model";
import PluginsTab, { registerPluginsHandlers } from "../index";
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
  _resetPaletteSources();
  _resetPluginsState();
  activeTab.value = "sessions";
});

afterEach(() => {
  setVscodeApi(null);
  _resetMessageBus();
  _resetPaletteSources();
  _resetPluginsState();
});

describe("PluginsTab", () => {
  it("asks the host for a snapshot on mount", () => {
    render(h(PluginsTab, {}));
    expect(posted).toContainEqual({ type: "getPlugins" });
  });

  it("shows the shared skeleton until the first snapshot arrives", () => {
    const { container } = render(h(PluginsTab, {}));
    expect(container.querySelector(".skeleton-panel")).toBeTruthy();
    expect(container.querySelector(".plg-item")).toBeNull();
  });

  it("renders every plugin once the snapshot arrives, inside a panel", async () => {
    const { container } = render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(container.querySelectorAll(".plg-item")).toHaveLength(5));
    // The root every other tab uses: `.tab-content .panel` owns the scroll.
    expect(container.querySelector(".panel")).toBeTruthy();
    expect(names()).toContain("ui-ux-pro-max");
  });

  it("drills into a plugin and back again", async () => {
    const { container } = render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(names()).toContain("caveman"));

    fireEvent.click(container.querySelector(".plg-item") as HTMLElement);
    await waitFor(() => screen.getByText("Enablement"));
    expect(container.querySelector(".d-title")?.textContent).toBe("caveman");

    fireEvent.click(container.querySelector(".back-btn") as HTMLElement);
    await waitFor(() => expect(container.querySelectorAll(".plg-item")).toHaveLength(5));
  });

  it("sends an explicit scope when a row's toggle is flipped", async () => {
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

  it("sends the scope the row's menu names when a settings file is opened", async () => {
    const { container } = render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(names()).toContain("caveman"));
    fireEvent.contextMenu(container.querySelector(".plg-item") as HTMLElement, {
      clientX: 10,
      clientY: 10,
    });
    await waitFor(() => screen.getByText("Open local settings.json"));
    fireEvent.click(screen.getByText("Open local settings.json"));
    expect(posted).toContainEqual({ type: "openPluginSettings", scope: "local" });
  });

  it("keeps the open detail in step with a fresh snapshot", async () => {
    const { container } = render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(names()).toContain("caveman"));
    fireEvent.click(container.querySelector(".plg-item") as HTMLElement);
    await waitFor(() => screen.getByText("Enablement"));

    // The host answers the toggle with a new snapshot; the panel must show the
    // new state rather than the copy it was opened with.
    deliver(
      snapshot({
        plugins: [{ ...snapshot().plugins[0], enabled: false, status: "disabled" }],
      }),
    );
    await waitFor(() => expect(screen.getByText("Enable")).toBeTruthy());
  });

  it("closes a detail whose plugin is gone from the new snapshot", async () => {
    const { container } = render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(names()).toContain("caveman"));
    fireEvent.click(container.querySelector(".plg-item") as HTMLElement);
    await waitFor(() => screen.getByText("Enablement"));

    deliver(snapshot({ plugins: [snapshot().plugins[1]] }));
    await waitFor(() => expect(selectedPlugin.value).toBeNull());
  });

  it("offers its plugins to the command palette", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(names()).toContain("caveman"));

    const items = collectPaletteItems("ui-ux");
    const hit = items.find((i) => i.id === "plugins:ui-ux-pro-max@ui-ux-pro-max-skill");
    expect(hit).toBeTruthy();
    expect(hit?.title).toBe("ui-ux-pro-max");
    expect(hit?.subtitle).toBe("ui-ux-pro-max-skill");
    expect(hit?.group).toBe("Plugins");
    expect(hit?.icon).toBe("package");
    expect(hit?.hint).toBe("not enabled");
  });

  it("opens the tab and the plugin when a palette entry is chosen", async () => {
    render(h(PluginsTab, {}));
    deliver(snapshot());
    await waitFor(() => expect(names()).toContain("caveman"));

    collectPaletteItems("caveman").find((i) => i.id === "plugins:caveman@caveman")?.run();
    expect(activeTab.value).toBe("plugins");
    expect(selectedPlugin.value?.id).toBe("caveman@caveman");
  });

  it("drops its palette source on unmount, so a remount cannot double it", () => {
    const dispose = registerPluginsHandlers();
    deliver(snapshot());
    expect(collectPaletteItems("caveman").length).toBeGreaterThan(0);
    dispose();
    expect(collectPaletteItems("caveman")).toEqual([]);
  });

  it("ignores a message that is not a plugins snapshot", () => {
    const dispose = registerPluginsHandlers();
    dispatch({ type: "pluginsSomethingElse" } as never);
    expect(collectPaletteItems("caveman")).toEqual([]);
    dispose();
  });
});
