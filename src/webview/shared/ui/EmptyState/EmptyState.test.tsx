// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("renders the description when provided", () => {
    render(<EmptyState title="t" description="check back later" />);
    expect(screen.getByText("check back later")).toBeTruthy();
  });
});
