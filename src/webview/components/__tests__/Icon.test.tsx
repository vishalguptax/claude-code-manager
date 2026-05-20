// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { Icon } from "../Icon";

describe("Icon", () => {
  it("renders a span with the icon name as data attribute", () => {
    const { container } = render(<Icon name="bot" />);
    const span = container.querySelector("span.icon");
    expect(span).toBeTruthy();
    expect(span?.getAttribute("data-icon")).toBe("bot");
  });
});
