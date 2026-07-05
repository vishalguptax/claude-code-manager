// @vitest-environment happy-dom
// Tests use `h()` rather than JSX so the file can keep a `.test.ts`
// extension — the project's vitest `include` glob only matches `*.test.ts`.
import { describe, it, expect, vi } from "vitest";
import { h } from "preact";
import { render, screen, fireEvent } from "@testing-library/preact";
import type { Hook } from "../../../../types";
import { HookItem } from "../HookItem";

function hook(partial: Partial<Hook> = {}): Hook {
  return {
    event: "PreToolUse",
    matcher: "Write",
    command: "echo hi",
    scope: "global",
    disabled: false,
    hookType: "command",
    entryIndex: 0,
    commandIndex: null,
    ...partial,
  };
}

function noop(): void {}

function renderItem(props: Partial<Parameters<typeof HookItem>[0]> = {}) {
  return render(
    h(HookItem, { hook: hook(), onOpen: noop, onToggle: noop, onDelete: noop, ...props }),
  );
}

describe("HookItem", () => {
  it("renders matcher, scope badge and command preview", () => {
    renderItem();
    expect(screen.getByText("Write")).toBeTruthy();
    expect(screen.getByText("Global")).toBeTruthy();
    expect(screen.getByText("echo hi")).toBeTruthy();
  });

  it("colours the scope badge like every other feature's scope badge", () => {
    renderItem({ hook: hook({ scope: "global" }) });
    expect(screen.getByText("Global").classList.contains("hook-scope-global")).toBe(true);
  });

  it("shows the all-matcher placeholder when matcher is blank", () => {
    renderItem({ hook: hook({ matcher: "" }) });
    expect(screen.getByText("*")).toBeTruthy();
  });

  it("hides the matcher entirely for a non-tool event (matcher has no effect there)", () => {
    renderItem({ hook: hook({ event: "SessionStart", matcher: "" }) });
    expect(screen.queryByText("*")).toBeNull();
  });

  it("truncates long commands", () => {
    renderItem({ hook: hook({ command: "x".repeat(120) }) });
    expect(screen.getByText(/x{60}…/)).toBeTruthy();
  });

  it("opens on body click", () => {
    const onOpen = vi.fn();
    renderItem({ onOpen });
    fireEvent.click(screen.getByText("echo hi"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens on Enter / Space", () => {
    const onOpen = vi.fn();
    const { container } = renderItem({ onOpen });
    const row = container.querySelector(".hook-item") as HTMLElement;
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("toggle button fires onToggle and does not open", () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    renderItem({ onOpen, onToggle });
    fireEvent.click(screen.getByTitle("Disable hook"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("delete button fires onDelete and does not open", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    renderItem({ onOpen, onDelete });
    fireEvent.click(screen.getByTitle("Delete hook"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows Enable title and disabled badge for a disabled hook", () => {
    renderItem({ hook: hook({ disabled: true }) });
    expect(screen.getByTitle("Enable hook")).toBeTruthy();
    expect(screen.getByText("disabled")).toBeTruthy();
  });

  it("renders a read-only badge for plugin hooks instead of actions", () => {
    renderItem({ hook: hook({ scope: "plugin", pluginName: "caveman@caveman" }) });
    expect(screen.getByText("read-only")).toBeTruthy();
    expect(screen.queryByTitle("Delete hook")).toBeNull();
  });
});
