// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { AccountSkeleton } from "./AccountSkeleton";

describe("AccountSkeleton", () => {
  it("mirrors the profile / quota / usage section stack", () => {
    const { container } = render(<AccountSkeleton />);
    // Three real `.acct-section` shells so the divider rhythm matches.
    expect(container.querySelectorAll(".acct-section").length).toBe(3);
    // Profile block with a circular avatar placeholder.
    expect(container.querySelector(".skeleton-profile .skeleton-circle")).toBeTruthy();
    // Two quota window placeholders, each a labelled bar.
    expect(container.querySelectorAll(".skeleton-quota-row").length).toBe(2);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
