// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { drag } from "../../__tests__/fixtures";
import { SESSION_IDS_MIME, readDroppedIds, startSessionDrag, useDropTarget } from "./explorerDnd";

afterEach(cleanup);

function source(ids: string[]) {
  function Source() {
    return h("div", { class: "src", draggable: true, onDragStart: (e: DragEvent) => startSessionDrag(e, ids) });
  }
  return render(h(Source, {})).container.querySelector(".src")!;
}

describe("startSessionDrag", () => {
  it("carries the ids under the private type", () => {
    const { data, accepted } = drag(source(["a", "b"]), "dragstart");
    expect(JSON.parse(data[SESSION_IDS_MIME])).toEqual(["a", "b"]);
    expect(accepted).toBe(false);
  });

  it("names the count on the drag image", () => {
    const setDragImage = vi.fn();
    const dt = { setData: () => {}, setDragImage, effectAllowed: "" };
    startSessionDrag({ dataTransfer: dt, preventDefault: vi.fn() } as unknown as DragEvent, ["a"]);
    expect((setDragImage.mock.calls[0][0] as HTMLElement).textContent).toBe("1 session");
  });

  it("cancels a drag that carries nothing", () => {
    expect(drag(source([]), "dragstart").accepted).toBe(true);
  });
});

describe("readDroppedIds", () => {
  const read = (raw: string) =>
    readDroppedIds({ getData: () => raw } as unknown as DataTransfer);

  it("reads an id array and rejects anything else", () => {
    expect(read('["a"]')).toEqual(["a"]);
    expect(read("not json")).toBeNull();
    expect(read("[1]")).toBeNull();
    expect(read("[]")).toBeNull();
    expect(read("")).toBeNull();
    expect(readDroppedIds(null)).toBeNull();
  });
});

function target(onDrop: ((ids: string[]) => void) | null) {
  function Target() {
    const t = useDropTarget(onDrop);
    return h("div", { class: t.over ? "target over" : "target", ...t.props }, h("span", null, "label"));
  }
  const { container } = render(h(Target, {}));
  return { container, el: container.querySelector(".target")! };
}

const ids = (list: string[]) => ({ [SESSION_IDS_MIME]: JSON.stringify(list) });

describe("useDropTarget", () => {
  it("accepts an explorer drag, highlights while over, and reports the ids", () => {
    const onDrop = vi.fn();
    const { container, el } = target(onDrop);
    expect(drag(el, "dragover", ids(["a", "b"])).accepted).toBe(true);
    expect(container.querySelector(".over")).toBeTruthy();
    expect(drag(el, "drop", ids(["a", "b"])).accepted).toBe(true);
    expect(onDrop).toHaveBeenCalledWith(["a", "b"]);
    expect(container.querySelector(".over")).toBeNull();
  });

  it("refuses a drag of anything else", () => {
    const onDrop = vi.fn();
    const { el } = target(onDrop);
    expect(drag(el, "dragover", { "text/plain": "hello" }).accepted).toBe(false);
    drag(el, "drop", { "text/plain": "hello" });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("keeps the highlight while moving onto a child, drops it on a real exit", () => {
    const { container, el } = target(vi.fn());
    drag(el, "dragover", ids(["a"]));
    drag(el, "dragleave", {}, { relatedTarget: el.querySelector("span") });
    expect(container.querySelector(".over")).toBeTruthy();
    drag(el, "dragleave", {}, { relatedTarget: document.body });
    expect(container.querySelector(".over")).toBeNull();
  });

  it("wires nothing for a target that accepts nothing", () => {
    const { el } = target(null);
    expect(drag(el, "dragover", ids(["a"])).accepted).toBe(false);
  });
});
