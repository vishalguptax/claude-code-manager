// @vitest-environment happy-dom
import { render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it } from "vitest";
import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("renders value and label, with an optional tooltip", () => {
    render(h(StatTile, { value: "12.0K", label: "tokens", title: "hint" }));
    expect(screen.getByText("12.0K")).toBeTruthy();
    const tile = screen.getByText("tokens").closest(".acct-stat") as HTMLElement;
    expect(tile.getAttribute("title")).toBe("hint");
  });
});
