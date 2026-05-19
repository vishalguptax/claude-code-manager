/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { esc } from "../esc";

describe("esc", () => {
  it("escapes html angle brackets", () => {
    expect(esc("<b>x</b>")).toBe("&lt;b&gt;x&lt;/b&gt;");
  });

  it("escapes ampersands", () => {
    expect(esc("a & b")).toBe("a &amp; b");
  });
});
