// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import { McpEmpty } from "./McpEmpty";

describe("McpEmpty", () => {
  it("renders the browse link and fires onBrowse", () => {
    const onBrowse = vi.fn();
    render(h(McpEmpty, { onBrowse }));
    fireEvent.click(screen.getByText("Browse MCP servers →"));
    expect(onBrowse).toHaveBeenCalledOnce();
  });
});
