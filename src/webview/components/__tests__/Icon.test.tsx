// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { Icon } from "../Icon";

describe("Icon", () => {
  it("renders an inline svg for a known icon name", () => {
    const { container } = render(<Icon name="bot" />);
    const svg = container.querySelector("svg.icon");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("data-icon")).toBe("bot");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    // The glyph geometry is injected, so the svg must contain child shapes.
    expect(svg?.querySelector("path, rect, circle, line, polyline, polygon")).toBeTruthy();
  });

  it("honors a custom size", () => {
    const { container } = render(<Icon name="settings" size={32} />);
    const svg = container.querySelector("svg.icon");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("renders a safe placeholder (no crash) for an unknown name", () => {
    const { container } = render(<Icon name="definitely-not-an-icon" />);
    expect(container.querySelector("svg")).toBeNull();
    const span = container.querySelector("span.icon");
    expect(span).toBeTruthy();
    expect(span?.getAttribute("data-icon")).toBe("definitely-not-an-icon");
  });
});
