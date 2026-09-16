import { describe, expect, it, vi } from "vitest";
import { blocked, orphaned, plugin } from "../__tests__/fixtures";
import { buildPluginMenu, EDITABLE_SCOPES } from "./menu";

function handlers() {
  return {
    onToggle: vi.fn(),
    onOpenDirectory: vi.fn(),
    onCopyId: vi.fn(),
    onOpenSettings: vi.fn(),
  };
}

const labels = (items: { label: string }[]): string[] => items.map((i) => i.label);

describe("EDITABLE_SCOPES", () => {
  it("lists the three writable settings files, lowest precedence first", () => {
    expect([...EDITABLE_SCOPES]).toEqual(["global", "project", "local"]);
  });
});

describe("buildPluginMenu", () => {
  it("names the settings file a toggle would write to", () => {
    const items = buildPluginMenu(plugin(), handlers());
    expect(items[0].label).toBe("Disable in user settings");
  });

  it("offers Enable for a plugin that is off", () => {
    const items = buildPluginMenu(plugin({ enabled: false }), handlers());
    expect(items[0].label).toBe("Enable in user settings");
  });

  it("withholds the toggle from a blocked plugin", () => {
    expect(labels(buildPluginMenu(blocked, handlers()))).not.toContain(
      "Disable in user settings",
    );
  });

  it("withholds the toggle when managed settings decide the plugin", () => {
    const items = buildPluginMenu(plugin({ decidedBy: "managed" }), handlers());
    expect(labels(items).some((l) => l.endsWith("settings"))).toBe(false);
  });

  it("does not offer a folder for a plugin with no install", () => {
    expect(labels(buildPluginMenu(orphaned, handlers()))).not.toContain("Open plugin folder");
  });

  it("offers every settings file, not just the one that won", () => {
    // An override is only fixable from the file that set it.
    expect(labels(buildPluginMenu(plugin(), handlers()))).toEqual(
      expect.arrayContaining([
        "Open user settings.json",
        "Open project settings.json",
        "Open local settings.json",
      ]),
    );
  });

  it("separates the settings files from the plugin's own actions", () => {
    const items = buildPluginMenu(plugin(), handlers());
    const first = items.find((i) => i.label === "Open user settings.json");
    expect(first?.separatorBefore).toBe(true);
  });

  it("routes each entry to its handler", () => {
    const h = handlers();
    const items = buildPluginMenu(plugin(), h);
    for (const item of items) item.onSelect?.();
    expect(h.onToggle).toHaveBeenCalledWith(plugin());
    expect(h.onOpenDirectory).toHaveBeenCalledWith("caveman@caveman");
    expect(h.onCopyId).toHaveBeenCalledWith("caveman@caveman");
    expect(h.onOpenSettings.mock.calls.map((c) => c[0])).toEqual([
      "global",
      "project",
      "local",
    ]);
  });
});
