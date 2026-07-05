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

  it("is keyboard-operable: Enter and Space fire onClick (role=button + tabIndex needs this)", () => {
    const onClick = vi.fn();
    render(<ListItem onClick={onClick}>row</ListItem>);
    const row = screen.getByRole("button");
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("ignores other keys", () => {
    const onClick = vi.fn();
    render(<ListItem onClick={onClick}>row</ListItem>);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Tab" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not double-fire when Enter/Space originates on a nested action button", () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    render(
      <ListItem onClick={onClick}>
        <button type="button" onClick={onAction}>
          act
        </button>
      </ListItem>,
    );
    fireEvent.keyDown(screen.getByText("act"), { key: "Enter" });
    expect(onClick).not.toHaveBeenCalled();
  });
});
