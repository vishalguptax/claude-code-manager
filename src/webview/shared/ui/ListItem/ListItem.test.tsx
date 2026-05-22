// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ListItem } from "../ListItem";

describe("ListItem", () => {
  it("renders children and fires onClick", () => {
    const onClick = vi.fn();
    render(<ListItem onClick={onClick}>row</ListItem>);
    fireEvent.click(screen.getByText("row"));
    expect(onClick).toHaveBeenCalled();
  });
});
