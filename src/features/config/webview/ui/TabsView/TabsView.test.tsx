// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetSections,
  hiddenTabsPref,
  TABS,
  tabOrderPref,
} from "../../../../../webview/shared/model";
import { createConfigApi } from "../../api";
import { TabsView } from "./TabsView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

/** Every row's checkbox, in the order they currently render. */
function rows(container: ParentNode): HTMLInputElement[] {
  return [...container.querySelectorAll('.cfg-tab-row input[type="checkbox"]')] as HTMLInputElement[];
}

/** The message TabsView last sent, or undefined if it never sent one. */
function lastSent(post: ReturnType<typeof vi.fn>): { hidden: string[]; order: string[] } | undefined {
  const call = post.mock.calls.at(-1)?.[0] as
    | { type: string; hidden: string[]; order: string[] }
    | undefined;
  return call?.type === "setTabPreferences" ? call : undefined;
}

beforeEach(() => {
  hiddenTabsPref.value = [];
  tabOrderPref.value = [];
  _resetSections();
});

afterEach(() => {
  hiddenTabsPref.value = [];
  tabOrderPref.value = [];
  _resetSections();
});

describe("TabsView", () => {
  it("lists every registered tab, checked, in the registry's own order", () => {
    const { api } = setup();
    const { container } = render(<TabsView api={api} />);
    const checkboxes = rows(container);
    expect(checkboxes).toHaveLength(TABS.length);
    expect(checkboxes.every((c) => c.checked)).toBe(true);
    expect(checkboxes.map((c) => c.getAttribute("aria-label"))).toEqual(
      TABS.map((t) => t.label),
    );
  });

  it("unchecks a tab named in hiddenTabsPref", () => {
    hiddenTabsPref.value = ["skills"];
    const { api } = setup();
    const { container } = render(<TabsView api={api} />);
    const skills = rows(container).find((c) => c.getAttribute("aria-label") === "Skills");
    expect(skills?.checked).toBe(false);
  });

  it("renders in the order given by tabOrderPref", () => {
    tabOrderPref.value = ["config", "account"];
    const { api } = setup();
    const { container } = render(<TabsView api={api} />);
    const labels = rows(container).map((c) => c.getAttribute("aria-label"));
    expect(labels?.slice(0, 2)).toEqual(["Config", "Account"]);
    // Every tab is still present — hiding is a separate concern from order.
    expect(labels).toHaveLength(TABS.length);
  });

  it("toggling a checkbox posts the full order with that id added to hidden", () => {
    const { api, post } = setup();
    const { container } = render(<TabsView api={api} />);
    const skills = rows(container).find((c) => c.getAttribute("aria-label") === "Skills");
    fireEvent.click(skills as HTMLInputElement);

    const sent = lastSent(post);
    expect(sent?.hidden).toEqual(["skills"]);
    expect(sent?.order).toEqual(TABS.map((t) => t.id));
  });

  it("toggling an already-hidden tab's checkbox posts it removed from hidden", () => {
    hiddenTabsPref.value = ["skills"];
    const { api, post } = setup();
    const { container } = render(<TabsView api={api} />);
    const skills = rows(container).find((c) => c.getAttribute("aria-label") === "Skills");
    fireEvent.click(skills as HTMLInputElement);

    expect(lastSent(post)?.hidden).toEqual([]);
  });

  describe("move up / move down", () => {
    it("disables move-up on the first row and move-down on the last", () => {
      const { api } = setup();
      const { container } = render(<TabsView api={api} />);
      const firstRow = container.querySelectorAll(".cfg-tab-row")[0] as HTMLElement;
      const lastRow = container.querySelectorAll(".cfg-tab-row")[TABS.length - 1] as HTMLElement;

      expect(firstRow.querySelector(".cfg-tab-move-up")).toHaveProperty("disabled", true);
      const lastRowButtons = lastRow.querySelectorAll("button");
      expect(lastRowButtons[1]).toHaveProperty("disabled", true);
    });

    it("moving the second row up posts it swapped with the first", () => {
      const { api, post } = setup();
      const { container } = render(<TabsView api={api} />);
      const secondRow = container.querySelectorAll(".cfg-tab-row")[1] as HTMLElement;
      const upButton = secondRow.querySelector(".cfg-tab-move-up") as HTMLButtonElement;
      fireEvent.click(upButton);

      const sent = lastSent(post);
      const defaultOrder = TABS.map((t) => t.id);
      expect(sent?.order[0]).toBe(defaultOrder[1]);
      expect(sent?.order[1]).toBe(defaultOrder[0]);
      expect(sent?.order.slice(2)).toEqual(defaultOrder.slice(2));
    });

    it("moving the first row down posts it swapped with the second", () => {
      const { api, post } = setup();
      const { container } = render(<TabsView api={api} />);
      const firstRow = container.querySelectorAll(".cfg-tab-row")[0] as HTMLElement;
      const downButton = firstRow.querySelectorAll("button")[1] as HTMLButtonElement;
      fireEvent.click(downButton);

      const defaultOrder = TABS.map((t) => t.id);
      expect(lastSent(post)?.order.slice(0, 2)).toEqual([defaultOrder[1], defaultOrder[0]]);
    });
  });

  describe("drag and drop", () => {
    /** Minimal DataTransfer stand-in — happy-dom does not implement one. */
    function dragEvent() {
      return { dataTransfer: { setData: vi.fn(), getData: vi.fn() } };
    }

    it("moves the dragged row to the drop target's position", () => {
      const { api, post } = setup();
      const { container } = render(<TabsView api={api} />);
      const rowsEls = container.querySelectorAll(".cfg-tab-row");
      const first = rowsEls[0];
      const third = rowsEls[2];

      fireEvent.dragStart(first, dragEvent());
      fireEvent.dragOver(third, dragEvent());
      fireEvent.drop(third, dragEvent());

      const defaultOrder = TABS.map((t) => t.id);
      const sent = lastSent(post);
      // The first id now sits where the third one used to be; everything
      // in between shifts up by one.
      expect(sent?.order[2]).toBe(defaultOrder[0]);
      expect(sent?.order[0]).toBe(defaultOrder[1]);
      expect(sent?.order[1]).toBe(defaultOrder[2]);
    });

    it("dropping on the row that started the drag sends nothing", () => {
      const { api, post } = setup();
      const { container } = render(<TabsView api={api} />);
      const first = container.querySelectorAll(".cfg-tab-row")[0];

      fireEvent.dragStart(first, dragEvent());
      fireEvent.dragOver(first, dragEvent());
      fireEvent.drop(first, dragEvent());

      expect(lastSent(post)).toBeUndefined();
    });
  });

  it("collapses and expands like every other Config section", () => {
    const { api } = setup();
    const { container } = render(<TabsView api={api} />);
    const header = container.querySelector('[data-section="tabs"]') as HTMLElement;
    expect(container.querySelector(".cfg-tabs-list")).toBeTruthy();

    fireEvent.click(header);
    expect(container.querySelector(".cfg-tabs-list")).toBeNull();

    fireEvent.click(header);
    expect(container.querySelector(".cfg-tabs-list")).toBeTruthy();
  });
});
