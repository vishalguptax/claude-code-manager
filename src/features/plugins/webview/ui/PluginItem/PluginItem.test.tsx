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

function renderItem(entry = plugin(), handlers: Record<string, unknown> = {}) {
  const onCopyId = vi.fn();
  const onToggle = vi.fn();
  const onContextMenu = vi.fn();
  const result = render(
    <PluginItem
      plugin={entry}
      onCopyId={onCopyId}
      onToggle={onToggle}
      onContextMenu={onContextMenu}
      {...handlers}
    />,
  );
  return { ...result, onCopyId, onToggle, onContextMenu };
}

describe("PluginItem", () => {
  it("shows the plugin name, marketplace and version", () => {
    const { container } = renderItem();
    expect(container.querySelector(".plg-item-name")?.textContent).toBe("caveman");
    expect(container.querySelector(".plg-item-source")?.textContent).toContain("caveman");
    expect(screen.getByText("0d95a81d35a9")).toBeTruthy();
  });

  it("states why an installed-but-unloaded plugin is inert", () => {
    renderItem(notEnabled);
    expect(screen.getByText(/Installed, but no settings file enables it/)).toBeTruthy();
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

  it("shows the override chain only when scopes disagree", () => {
    const { rerender } = renderItem(overridden);
    expect(screen.getByText("user: on › project: off › local: on")).toBeTruthy();

    rerender(
      <PluginItem
        plugin={plugin()}
        onCopyId={vi.fn()}
        onToggle={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );
    expect(screen.queryByText(/user: on/)).toBeNull();
  });

  it("offers a switch reflecting the current state", () => {
    renderItem();
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    // The visible name is the row heading, which CSS ellipsizes — the
    // accessible name has to survive that, so it lives on an attribute.
    expect(sw.getAttribute("aria-label")).toBe("Disable caveman@caveman");
  });

  it("labels the switch as Enable for a plugin that is off", () => {
    renderItem(notEnabled);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.getAttribute("aria-label")).toBe("Enable ui-ux-pro-max@ui-ux-pro-max-skill");
  });

  it("withholds the switch from a blocked plugin", () => {
    renderItem(blocked);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText("blocked")).toBeTruthy();
  });

  it("toggles without also opening the row's menu", () => {
    const { onToggle, onContextMenu } = renderItem();
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(plugin());
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it("copies the id without also opening the row's menu", () => {
    const { onCopyId, onContextMenu } = renderItem();
    fireEvent.click(screen.getByLabelText("Copy plugin id caveman@caveman"));
    expect(onCopyId).toHaveBeenCalledWith("caveman@caveman");
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it("opens the actions menu at the pointer on right-click", () => {
    const { container, onContextMenu } = renderItem();
    const row = container.querySelector(".plg-item") as HTMLElement;
    fireEvent.contextMenu(row, { clientX: 120, clientY: 64 });
    expect(onContextMenu).toHaveBeenCalledWith(plugin(), 120, 64);
  });

  it("opens the same menu from the keyboard, anchored to the row", () => {
    const { container, onContextMenu } = renderItem();
    const row = container.querySelector(".plg-item") as HTMLElement;
    // A row that can only be reached with a pointer hides every action from
    // a keyboard-only user, so Enter has to reach the same menu.
    expect(row.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0][0]).toEqual(plugin());
  });
});
