// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { _resetPaletteSources, registerPaletteSource } from "../../shared/model/palette";
import { CommandPalette } from "./CommandPalette";

function seed(run = vi.fn()) {
  registerPaletteSource("test", () => [
    {
      id: "s1",
      title: "Quota bar live refresh",
      subtitle: "claude-code-manager",
      group: "Sessions",
      icon: "message-square",
      hint: "18m",
      run,
    },
    { id: "s2", title: "Heatmap month labels", group: "Sessions", run: () => {} },
    { id: "k1", title: "release", subtitle: "Curate a release", group: "Skills", run: () => {} },
  ]);
  return run;
}

const rows = (c: ParentNode): HTMLElement[] =>
  Array.from(c.querySelectorAll<HTMLElement>(".palette-item"));
const activeRow = (c: ParentNode): HTMLElement | null =>
  c.querySelector<HTMLElement>(".palette-item.active");

beforeEach(() => {
  _resetPaletteSources();
});
afterEach(cleanup);

describe("CommandPalette", () => {
  it("renders nothing while closed", () => {
    seed();
    const { container } = render(<CommandPalette open={false} onClose={() => {}} />);
    expect(container.querySelector(".palette")).toBeNull();
  });

  it("lists every item under its group heading when opened", () => {
    seed();
    const { container } = render(<CommandPalette open onClose={() => {}} />);
    expect(rows(container).length).toBe(3);
    const headings = Array.from(container.querySelectorAll(".palette-group")).map(
      (n) => n.textContent,
    );
    expect(headings).toEqual(["Sessions", "Skills"]);
  });

  it("narrows as the query is typed", () => {
    seed();
    const { container } = render(<CommandPalette open onClose={() => {}} />);
    fireEvent.input(container.querySelector(".palette-input") as HTMLInputElement, {
      target: { value: "quota" },
    });
    expect(rows(container).map((r) => r.textContent)).toHaveLength(1);
  });

  it("says so when nothing matches", () => {
    seed();
    const { container } = render(<CommandPalette open onClose={() => {}} />);
    fireEvent.input(container.querySelector(".palette-input") as HTMLInputElement, {
      target: { value: "zzzz" },
    });
    expect(container.querySelector(".palette-empty")).toBeTruthy();
    expect(rows(container).length).toBe(0);
  });

  // ── Keyboard ─────────────────────────────────────────────────────────
  // The whole point of this surface. Focus stays in the input and the
  // selection is announced through aria-activedescendant; moving DOM focus to
  // each row instead would stop the user typing.

  it("highlights the first item and keeps focus in the input", () => {
    seed();
    const { container } = render(<CommandPalette open onClose={() => {}} />);
    const input = container.querySelector(".palette-input") as HTMLInputElement;
    expect(activeRow(container)?.id).toBe("palette-item-0");
    expect(input.getAttribute("aria-activedescendant")).toBe("palette-item-0");
    expect(document.activeElement).toBe(input);
  });

  it("moves the selection with the arrow keys and wraps at both ends", () => {
    seed();
    const { container } = render(<CommandPalette open onClose={() => {}} />);
    const input = container.querySelector(".palette-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeRow(container)?.id).toBe("palette-item-1");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeRow(container)?.id).toBe("palette-item-2");
  });

  it("jumps to the ends with Home and End", () => {
    seed();
    const { container } = render(<CommandPalette open onClose={() => {}} />);
    const input = container.querySelector(".palette-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "End" });
    expect(activeRow(container)?.id).toBe("palette-item-2");
    fireEvent.keyDown(input, { key: "Home" });
    expect(activeRow(container)?.id).toBe("palette-item-0");
  });

  it("runs the highlighted item on Enter", () => {
    const run = seed();
    const onClose = vi.fn();
    const { container } = render(<CommandPalette open onClose={onClose} />);
    fireEvent.keyDown(container.querySelector(".palette-input") as HTMLInputElement, {
      key: "Enter",
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape without running anything", () => {
    const run = seed();
    const onClose = vi.fn();
    const { container } = render(<CommandPalette open onClose={onClose} />);
    fireEvent.keyDown(container.querySelector(".palette-input") as HTMLInputElement, {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("does nothing on Enter when there is no match to run", () => {
    seed();
    const onClose = vi.fn();
    const { container } = render(<CommandPalette open onClose={onClose} />);
    const input = container.querySelector(".palette-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "zzzz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  // A narrowing query can leave the cursor past the end of the shorter list.
  it("pulls the selection back in range when results shrink", () => {
    seed();
    const { container } = render(<CommandPalette open onClose={() => {}} />);
    const input = container.querySelector(".palette-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "End" });
    expect(activeRow(container)?.id).toBe("palette-item-2");
    fireEvent.input(input, { target: { value: "quota" } });
    expect(activeRow(container)?.id).toBe("palette-item-0");
  });

  // ── Pointer ──────────────────────────────────────────────────────────

  it("runs an item on mousedown, closing first", () => {
    const run = seed();
    const onClose = vi.fn();
    const { container } = render(<CommandPalette open onClose={onClose} />);
    fireEvent.mouseDown(rows(container)[0]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  // Hover moves the same cursor the keyboard uses, so there is never a second
  // "which one is selected?" on screen.
  it("moves the selection on hover rather than adding a second highlight", () => {
    seed();
    const { container } = render(<CommandPalette open onClose={() => {}} />);
    fireEvent.mouseEnter(rows(container)[2]);
    expect(container.querySelectorAll(".palette-item.active").length).toBe(1);
    expect(activeRow(container)?.id).toBe("palette-item-2");
  });

  it("dismisses on a press outside the box but not inside it", () => {
    seed();
    const onClose = vi.fn();
    const { container } = render(<CommandPalette open onClose={onClose} />);
    fireEvent.mouseDown(container.querySelector(".palette") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector(".palette-backdrop") as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it("is announced as a modal dialog", () => {
    seed();
    const { container } = render(<CommandPalette open onClose={() => {}} />);
    const box = container.querySelector(".palette");
    expect(box?.getAttribute("role")).toBe("dialog");
    expect(box?.getAttribute("aria-modal")).toBe("true");
    expect(container.querySelector('[role="listbox"]')).toBeTruthy();
    expect(container.querySelectorAll('[role="option"]').length).toBe(3);
  });
});
