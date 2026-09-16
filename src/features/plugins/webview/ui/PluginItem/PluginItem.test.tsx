// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import {
  blocked,
  notEnabled,
  orphaned,
  overridden,
  plugin,
  untrusted,
} from "../../__tests__/fixtures";
import { PluginItem } from "./PluginItem";

function renderItem(entry = plugin(), props: Record<string, unknown> = {}) {
  const onSelect = vi.fn();
  const onCopyId = vi.fn();
  const onToggle = vi.fn();
  const onContextMenu = vi.fn();
  const result = render(
    <PluginItem
      plugin={entry}
      onSelect={onSelect}
      onCopyId={onCopyId}
      onToggle={onToggle}
      onContextMenu={onContextMenu}
      {...props}
    />,
  );
  return { ...result, onSelect, onCopyId, onToggle, onContextMenu };
}

describe("PluginItem", () => {
  it("is built on the shared list row", () => {
    // The row takes its cursor, hover fill, active fill and focus ring from
    // `.list-item`; dropping the class would silently restate all four.
    const { container } = renderItem();
    const row = container.querySelector(".plg-item") as HTMLElement;
    expect(row.classList.contains("list-item")).toBe(true);
    expect(row.getAttribute("role")).toBe("button");
  });

  it("shows the plugin name, marketplace and version", () => {
    const { container } = renderItem();
    expect(container.querySelector(".plg-item-name")?.textContent).toBe("caveman");
    expect(container.querySelector(".plg-item-source")?.textContent).toContain("caveman");
    expect(screen.getByText("0d95a81d35a9")).toBeTruthy();
  });

  it("names the settings file that decided the plugin, in the shared scope chip", () => {
    const { container } = renderItem();
    const chip = container.querySelector(".vsc-badge--scope-global") as HTMLElement;
    expect(chip.textContent).toBe("user");
    expect(chip.getAttribute("title")).toBe("Decided by user settings");
  });

  it("omits the scope chip when no settings file mentions the plugin", () => {
    const { container } = renderItem(notEnabled);
    expect(container.querySelector('[class*="vsc-badge--scope-"]')).toBeNull();
  });

  it("states why an installed-but-unloaded plugin is inert", () => {
    renderItem(notEnabled);
    expect(screen.getByText(/Installed, but nothing enables it/)).toBeTruthy();
    expect(screen.getByText("not enabled")).toBeTruthy();
  });

  it("states that an orphaned entry has no install", () => {
    renderItem(orphaned);
    expect(screen.getByText("no install")).toBeTruthy();
    expect(screen.getByText(/no copy is installed/)).toBeTruthy();
  });

  it("warns when an active plugin comes from a marketplace the policy bars", () => {
    renderItem(untrusted);
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("rogue-mkt");
    expect(note.textContent).toContain("does not allow");
  });

  it("shows the override chain as chips, marking the file that won", () => {
    const { container } = renderItem(overridden);
    const chips = [...container.querySelectorAll(".plg-chain-tag")];
    expect(chips.map((c) => c.textContent)).toEqual([
      "user: on",
      "project: off",
      "local: on",
    ]);
    const winners = chips.filter((c) => c.classList.contains("is-winner"));
    expect(winners).toHaveLength(1);
    expect(winners[0].textContent).toBe("local: on");
  });

  it("hides the chain when only one scope has an opinion", () => {
    const { container } = renderItem();
    expect(container.querySelector(".plg-chain-tag")).toBeNull();
  });

  it("offers a shared icon button for the enable/disable action", () => {
    const { container } = renderItem();
    // The visible name is the row heading, which CSS ellipsizes — the
    // accessible name has to survive that, so it lives on an attribute.
    const toggle = screen.getByLabelText("Disable caveman@caveman");
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.classList.contains("btn-icon")).toBe(true);
    expect(container.querySelector(".plg-item-toggle")).toBe(toggle);
  });

  it("labels the toggle as Enable for a plugin that is off", () => {
    renderItem(notEnabled);
    expect(screen.getByLabelText("Enable ui-ux-pro-max@ui-ux-pro-max-skill")).toBeTruthy();
  });

  it("withholds the toggle from a blocked plugin", () => {
    const { container } = renderItem(blocked);
    expect(container.querySelector(".plg-item-toggle")).toBeNull();
    expect(screen.getByText("blocked")).toBeTruthy();
  });

  it("toggles without also opening the row", () => {
    const { onToggle, onSelect } = renderItem();
    fireEvent.click(screen.getByLabelText("Disable caveman@caveman"));
    expect(onToggle).toHaveBeenCalledWith(plugin());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("copies the id without also opening the row", () => {
    const { onCopyId, onSelect } = renderItem();
    fireEvent.click(screen.getByLabelText("Copy plugin id caveman@caveman"));
    expect(onCopyId).toHaveBeenCalledWith("caveman@caveman");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens the plugin when the row is clicked", () => {
    const { container, onSelect } = renderItem();
    fireEvent.click(container.querySelector(".plg-item") as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(plugin());
  });

  it("opens the plugin from the keyboard", () => {
    const { container, onSelect } = renderItem();
    const row = container.querySelector(".plg-item") as HTMLElement;
    // A row that can only be reached with a pointer hides the detail view
    // from a keyboard-only user, so Enter has to open it too.
    expect(row.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(plugin());
  });

  it("opens the actions menu at the pointer on right-click", () => {
    const { container, onContextMenu, onSelect } = renderItem();
    const row = container.querySelector(".plg-item") as HTMLElement;
    fireEvent.contextMenu(row, { clientX: 120, clientY: 64 });
    expect(onContextMenu).toHaveBeenCalledWith(plugin(), 120, 64);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marks the open plugin as the active row", () => {
    const { container } = renderItem(plugin(), { active: true });
    expect(container.querySelector(".plg-item")?.classList.contains("active")).toBe(true);
  });
});
