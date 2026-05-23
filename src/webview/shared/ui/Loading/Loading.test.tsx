// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { Loading } from "../Loading";

describe("Loading", () => {
  it("renders the shimmer skeleton placeholder", () => {
    const { container } = render(<Loading />);
    expect(container.querySelector(".panel-loader")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-row").length).toBe(6);
  });

  it("passes a custom row count through to the skeleton", () => {
    const { container } = render(<Loading rows={3} />);
    expect(container.querySelectorAll(".skeleton-row").length).toBe(3);
  });
});
