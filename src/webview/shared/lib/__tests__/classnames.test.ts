import { describe, it, expect } from "vitest";
import cx, { cx as named } from "../classnames";

describe("classnames", () => {
  it("joins truthy class names", () => {
    expect(cx("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(named("a", false, undefined, "b")).toBe("a b");
  });
});
