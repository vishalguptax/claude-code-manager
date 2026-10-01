// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { availablePlugin } from "../../__tests__/fixtures";
import { AvailableItem } from "./AvailableItem";

describe("AvailableItem", () => {
  it("leads with the name and description, the catalog's byline under them", () => {
    const { container } = render(<AvailableItem plugin={availablePlugin()} onSelect={vi.fn()} />);
    expect(container.querySelector(".plg-item-name")?.textContent).toBe("swift-lsp");
    expect(container.querySelector(".plg-avail-desc")?.textContent).toBe(
      "Swift language server for code intelligence.",
    );
    expect(container.querySelector(".plg-avail-byline")?.textContent).toBe("development · Anthropic");
  });

  it("marks an installed plugin and leaves out what the catalog did not say", () => {
    const { container } = render(
      <AvailableItem
        plugin={availablePlugin({ installed: true, description: "", category: "", author: "" })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("installed")).toBeTruthy();
    expect(container.querySelector(".plg-avail-desc")).toBeNull();
    expect(container.querySelector(".plg-avail-byline")).toBeNull();
  });

  it("opens the plugin on click", () => {
    const onSelect = vi.fn();
    const plugin = availablePlugin();
    render(<AvailableItem plugin={plugin} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("swift-lsp"));
    expect(onSelect).toHaveBeenCalledWith(plugin);
  });
});
