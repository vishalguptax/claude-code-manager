// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { h } from "preact";
import { render, screen } from "@testing-library/preact";
import { DisabledBadge, ReadOnlyBadge, ScopeBadge, TypeBadge } from "./McpBadges";

describe("McpBadges", () => {
  it("renders each badge with its label and MCP modifier class on the shared chrome", () => {
    const { container } = render(
      h("div", null, [
        h(TypeBadge, { type: "http" }),
        h(ScopeBadge, { scope: "plugin" }),
        h(DisabledBadge, {}),
        h(ReadOnlyBadge, { pluginName: "p@m" }),
      ]),
    );
    const typeBadge = container.querySelector(".mcp-type-http");
    const scopeBadge = container.querySelector(".mcp-scope-plugin");
    expect(typeBadge?.textContent).toBe("http");
    expect(typeBadge?.classList.contains("vsc-badge")).toBe(true);
    expect(scopeBadge?.textContent).toBe("plugin");
    expect(scopeBadge?.classList.contains("vsc-badge")).toBe(true);
    expect(screen.getByText("disabled")).toBeTruthy();
    expect(screen.getByText("read-only")).toBeTruthy();
    expect(screen.getByTitle("Owned by plugin p@m")).toBeTruthy();
  });

  it("flags sse as deprecated via title, and renders ws with no such note", () => {
    const { rerender } = render(h(TypeBadge, { type: "sse" }));
    expect(screen.getByTitle(/deprecated/i)).toBeTruthy();
    rerender(h(TypeBadge, { type: "ws" }));
    expect(screen.getByText("ws")).toBeTruthy();
    expect(screen.queryByTitle(/deprecated/i)).toBeNull();
  });
});
