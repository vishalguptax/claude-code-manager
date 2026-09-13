// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { StatTile, StatTileGrid } from "./StatTile";

describe("StatTile", () => {
  it("renders the figure and its label", () => {
    render(<StatTile value="397.2k" label="tokens" />);
    expect(screen.getByText("397.2k")).toBeTruthy();
    expect(screen.getByText("tokens")).toBeTruthy();
  });

  it("forwards the tooltip for a figure that needs explaining", () => {
    const { container } = render(
      <StatTile value="51.2M" label="cache read" title="Token-weighted hit rate: 98%" />,
    );
    expect(container.querySelector(".stat-tile")?.getAttribute("title")).toBe(
      "Token-weighted hit rate: 98%",
    );
  });

  it("sets no title attribute when there is nothing to explain", () => {
    const { container } = render(<StatTile value="1" label="x" />);
    expect(container.querySelector(".stat-tile")?.hasAttribute("title")).toBe(false);
  });

  // The component formats nothing: callers pass display strings, because the
  // Account tab and the transcript format their numbers differently (compact
  // vs locale) and a tile that reformatted them would fight both.
  it("renders the value verbatim", () => {
    render(<StatTile value="1,234,567" label="tokens" />);
    expect(screen.getByText("1,234,567")).toBeTruthy();
  });

  it("groups tiles in a grid", () => {
    const { container } = render(
      <StatTileGrid>
        <StatTile value="1" label="a" />
        <StatTile value="2" label="b" />
      </StatTileGrid>,
    );
    expect(container.querySelector(".stat-tile-grid")).toBeTruthy();
    expect(container.querySelectorAll(".stat-tile").length).toBe(2);
  });

  // A conditional tile renders as null; the grid must not care.
  it("tolerates an absent tile", () => {
    const { container } = render(
      <StatTileGrid>
        <StatTile value="1" label="a" />
        {null}
        <StatTile value="2" label="b" />
      </StatTileGrid>,
    );
    expect(container.querySelectorAll(".stat-tile").length).toBe(2);
  });
});
