// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders the text", () => {
    const { getByText } = render(<Badge text="project" />);
    expect(getByText("project")).toBeTruthy();
  });

  it("applies the default variant class when none is given", () => {
    const { container } = render(<Badge text="x" />);
    const el = container.querySelector(".vsc-badge");
    expect(el?.classList.contains("vsc-badge--default")).toBe(true);
  });

  it("applies the requested variant modifier", () => {
    const { container } = render(<Badge text="3" variant="count" />);
    expect(container.querySelector(".vsc-badge--count")).toBeTruthy();
  });

  it("forwards the title attribute", () => {
    const { container } = render(<Badge text="ro" title="read only" />);
    expect(container.querySelector(".vsc-badge")?.getAttribute("title")).toBe("read only");
  });
});
