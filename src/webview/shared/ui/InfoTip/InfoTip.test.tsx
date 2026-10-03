// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { InfoTip } from "./InfoTip";

describe("InfoTip", () => {
  it("carries its text as the tooltip and as the accessible name", () => {
    const { container } = render(<InfoTip text="Keeps the snapshots /rewind restores." />);
    const tip = container.querySelector(".info-tip") as HTMLElement;
    expect(tip.getAttribute("title")).toBe("Keeps the snapshots /rewind restores.");
    expect(tip.getAttribute("aria-label")).toBe("Keeps the snapshots /rewind restores.");
    expect(tip.getAttribute("role")).toBe("img");
  });

  // Keyboard users reach it with Tab; the TooltipLayer shows it on focus.
  it("is focusable, so the text is never pointer-only", () => {
    const { container } = render(<InfoTip text="x" />);
    expect((container.querySelector(".info-tip") as HTMLElement).tabIndex).toBe(0);
  });
});
