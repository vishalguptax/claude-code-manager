// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { ErrorBanner } from "../ErrorBanner";

describe("ErrorBanner", () => {
  it("renders nothing for an empty error list", () => {
    const { container } = render(<ErrorBanner errors={[]} />);
    expect(container.querySelector(".error-banner")).toBeNull();
  });

  it("renders one row per error", () => {
    const errors = [
      "Failed to parse .claude/settings.json: Unexpected token",
      "Failed to parse .mcp.json: Unexpected end of JSON input",
    ];
    const { container, getByText } = render(<ErrorBanner errors={errors} />);
    expect(container.querySelectorAll(".error-banner__item")).toHaveLength(2);
    expect(getByText(errors[0])).toBeTruthy();
    expect(getByText(errors[1])).toBeTruthy();
  });

  it("exposes the banner as an alert for assistive tech", () => {
    const { container } = render(<ErrorBanner errors={["boom"]} />);
    expect(container.querySelector(".error-banner")?.getAttribute("role")).toBe("alert");
  });
});
