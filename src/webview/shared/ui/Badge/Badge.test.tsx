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

  // ── Scope ───────────────────────────────────────────────────────────
  // Five features show this chip, and they used to each declare the same
  // colours privately (.scope-*, .cmd-scope-*, .hook-scope-*, .mcp-scope-*).
  // Now they pass a scope and the map lives in one stylesheet, so these tests
  // are the only place the contract between the two is stated.

  it("emits both the scope variant and the per-scope modifier", () => {
    const { container } = render(<Badge text="project" scope="project" />);
    const el = container.querySelector(".vsc-badge");
    expect(el?.classList.contains("vsc-badge--scope")).toBe(true);
    expect(el?.classList.contains("vsc-badge--scope-project")).toBe(true);
  });

  it("covers every scope a feature can pass", () => {
    for (const scope of ["project", "local", "global", "builtin", "plugin"] as const) {
      const { container, unmount } = render(<Badge text={scope} scope={scope} />);
      expect(container.querySelector(`.vsc-badge--scope-${scope}`)).toBeTruthy();
      unmount();
    }
  });

  // `scope` picks the variant, so a caller passes one or the other. If both
  // arrive, scope wins rather than emitting two conflicting variant classes.
  it("lets scope win over an explicit variant", () => {
    const { container } = render(<Badge text="x" variant="danger" scope="plugin" />);
    const el = container.querySelector(".vsc-badge");
    expect(el?.classList.contains("vsc-badge--scope")).toBe(true);
    expect(el?.classList.contains("vsc-badge--danger")).toBe(false);
  });

  it("adds no scope modifier when scope is omitted", () => {
    const { container } = render(<Badge text="x" variant="status" />);
    expect(container.querySelector('[class*="vsc-badge--scope-"]')).toBeNull();
  });
});
