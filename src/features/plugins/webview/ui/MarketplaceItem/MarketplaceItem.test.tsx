// @vitest-environment happy-dom
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { marketplace } from "../../__tests__/fixtures";
import { MarketplaceItem } from "./MarketplaceItem";

describe("MarketplaceItem", () => {
  it("shows the name, the repo it came from and its plugin count", () => {
    render(<MarketplaceItem marketplace={marketplace()} />);
    expect(screen.getByText("caveman")).toBeTruthy();
    expect(screen.getByText("JuliusBrussee/caveman")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("prefixes a non-github source with its kind", () => {
    render(
      <MarketplaceItem
        marketplace={marketplace({ sourceKind: "local", sourceLabel: "/srv/mkt" })}
      />,
    );
    expect(screen.getByText("local: /srv/mkt")).toBeTruthy();
  });

  it("labels a marketplace the policy bars", () => {
    render(<MarketplaceItem marketplace={marketplace({ trust: "unlisted" })} />);
    expect(screen.getByText("not allowed")).toBeTruthy();
  });

  it("labels the official marketplace", () => {
    render(
      <MarketplaceItem
        marketplace={marketplace({ name: "claude-plugins-official", trust: "official" })}
      />,
    );
    expect(screen.getByText("official")).toBeTruthy();
  });

  it("says nothing extra when the marketplace is cloned", () => {
    render(<MarketplaceItem marketplace={marketplace()} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("is not dressed up as a clickable row", () => {
    // A marketplace has no action of its own; `.list-item` would promise a
    // pointer cursor and hover fill that lead nowhere.
    const { container } = render(<MarketplaceItem marketplace={marketplace()} />);
    const row = container.querySelector(".plg-mkt") as HTMLElement;
    expect(row.classList.contains("plg-item")).toBe(true);
    expect(row.classList.contains("list-item")).toBe(false);
  });

  it("explains a pre-registered marketplace that was never fetched, quietly", () => {
    const { container } = render(
      <MarketplaceItem
        marketplace={marketplace({ registered: false, declaredIn: ["project"] })}
      />,
    );
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("Listed in project settings");
    expect(note.textContent).toContain("has not downloaded it yet");
    // Merely pending, not a finding: the quiet note, not the warning strip.
    expect(note.classList.contains("plg-note")).toBe(true);
    expect(container.querySelector(".plg-item-warning")).toBeNull();
  });

  it("explains a marketplace that only a plugin id mentions", () => {
    render(
      <MarketplaceItem
        marketplace={marketplace({
          name: "nowhere",
          sourceKind: "",
          sourceLabel: "",
          registered: false,
          declaredIn: [],
          trust: "unknown",
        })}
      />,
    );
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("never added on this machine");
    // Nothing will ever fetch this one — a finding, so it keeps the warning.
    expect(note.classList.contains("plg-item-warning")).toBe(true);
    expect(screen.getByText("source unknown")).toBeTruthy();
    expect(screen.getByText("unregistered")).toBeTruthy();
  });

  it("pluralises the plugin-count tooltip", () => {
    const { container, rerender } = render(
      <MarketplaceItem marketplace={marketplace({ pluginCount: 1 })} />,
    );
    expect(container.querySelector('[title="1 plugin"]')).toBeTruthy();

    rerender(<MarketplaceItem marketplace={marketplace({ pluginCount: 0 })} />);
    expect(container.querySelector('[title="0 plugins"]')).toBeTruthy();
  });
});
