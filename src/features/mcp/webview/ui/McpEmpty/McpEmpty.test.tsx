// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import { McpEmpty } from "./McpEmpty";

describe("McpEmpty", () => {
  it("offers the catalog as the way to add a first server", () => {
    const onOpenCatalog = vi.fn();
    render(h(McpEmpty, { onOpenCatalog }));
    fireEvent.click(screen.getByText("Add from catalog"));
    expect(onOpenCatalog).toHaveBeenCalledOnce();
  });
});
