import { describe, it, expect } from "vitest";
import { ICONS, icon } from "../icons";

describe("ICONS map", () => {
  it("contains all expected icon names", () => {
    const expected = [
      "plus",
      "play",
      "split-square-horizontal",
      "refresh-cw",
      "x",
      "chevron-down",
      "pin",
      "pin-off",
      "git-fork",
      "terminal",
      "copy",
      "trash-2",
      "arrow-left",
      "external-link",
      "circle-alert",
      "github",
      "linkedin",
    ];
    for (const name of expected) {
      expect(ICONS).toHaveProperty(name);
    }
  });

  it("every icon value contains valid SVG path/shape elements", () => {
    const svgTags = /(<path |<polygon |<polyline |<rect |<circle |<line |<ellipse )/;
    for (const [name, markup] of Object.entries(ICONS)) {
      expect(markup, `Icon "${name}" should contain SVG elements`).toMatch(svgTags);
    }
  });

  it("no icon value is empty", () => {
    for (const [name, markup] of Object.entries(ICONS)) {
      expect(markup.trim().length, `Icon "${name}" should not be empty`).toBeGreaterThan(0);
    }
  });
});

describe("icon() helper", () => {
  it("wraps icon markup in an <svg> tag with default size 16", () => {
    const svg = icon("plus");
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="16"');
    expect(svg).toContain('height="16"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain("</svg>");
  });

  it("respects a custom size parameter", () => {
    const svg = icon("x", 24);
    expect(svg).toContain('width="24"');
    expect(svg).toContain('height="24"');
  });

  it("returns an empty SVG shell for an unknown icon name", () => {
    const svg = icon("nonexistent-icon");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // The inner content should be empty (ICONS["nonexistent-icon"] is undefined -> "")
    expect(svg).not.toContain("<path");
  });

  it("includes the correct inner paths for a known icon", () => {
    const svg = icon("play");
    expect(svg).toContain("<polygon");
    expect(svg).toContain("points=");
  });

  it("applies standard SVG attributes", () => {
    const svg = icon("pin");
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-linejoin="round"');
  });
});
