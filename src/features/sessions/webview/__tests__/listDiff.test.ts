// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { applyDiff } from "../components/listDiff";

function makeFactory() {
  const created: string[] = [];
  const factory = (key: string): HTMLElement => {
    created.push(key);
    const el = document.createElement("div");
    el.className = "row";
    el.textContent = key;
    return el;
  };
  return { factory, created };
}

function noopUpdater(_node: HTMLElement, _key: string): void {
  // intentionally empty — order/identity tests don't care about state
}

function keysOf(container: HTMLElement): string[] {
  return Array.from(container.children).map(
    (c) => (c as HTMLElement).dataset.key ?? "",
  );
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

describe("applyDiff", () => {
  it("inserts nodes for an empty container", () => {
    const { factory, created } = makeFactory();
    applyDiff(container, ["a", "b", "c"], factory, noopUpdater);
    expect(keysOf(container)).toEqual(["a", "b", "c"]);
    expect(created).toEqual(["a", "b", "c"]);
  });

  it("removes orphans not present in desiredKeys", () => {
    const { factory } = makeFactory();
    applyDiff(container, ["a", "b", "c"], factory, noopUpdater);
    const { factory: f2, created: c2 } = makeFactory();
    applyDiff(container, ["a", "c"], f2, noopUpdater);
    expect(keysOf(container)).toEqual(["a", "c"]);
    expect(c2).toEqual([]);
  });

  it("reorders without recreating reused nodes", () => {
    const { factory } = makeFactory();
    applyDiff(container, ["a", "b", "c"], factory, noopUpdater);
    const a = container.children[0];
    const b = container.children[1];
    const c = container.children[2];

    const { factory: f2, created: c2 } = makeFactory();
    applyDiff(container, ["c", "a", "b"], f2, noopUpdater);
    expect(keysOf(container)).toEqual(["c", "a", "b"]);
    expect(c2).toEqual([]);
    expect(container.children[0]).toBe(c);
    expect(container.children[1]).toBe(a);
    expect(container.children[2]).toBe(b);
  });

  it("calls updater on existing nodes in place", () => {
    const { factory } = makeFactory();
    applyDiff(container, ["a", "b"], factory, noopUpdater);
    const a = container.children[0] as HTMLElement;

    const updates: string[] = [];
    applyDiff(
      container,
      ["a", "b"],
      makeFactory().factory,
      (node, key) => {
        updates.push(key);
        node.dataset.touched = "yes";
      },
    );
    expect(updates).toEqual(["a", "b"]);
    expect(a.dataset.touched).toBe("yes");
    expect(container.children[0]).toBe(a);
  });

  it("handles a mixed insert + remove + reorder + update pass", () => {
    const { factory } = makeFactory();
    applyDiff(container, ["a", "b", "c", "d"], factory, noopUpdater);
    const a = container.children[0];
    const c = container.children[2];

    const { factory: f2, created } = makeFactory();
    const updates: string[] = [];
    applyDiff(container, ["c", "a", "e"], f2, (node, key) => {
      updates.push(key);
      node.dataset.pass = "2";
    });
    expect(keysOf(container)).toEqual(["c", "a", "e"]);
    expect(container.children[0]).toBe(c);
    expect(container.children[1]).toBe(a);
    expect(created).toEqual(["e"]);
    expect(updates).toEqual(["c", "a", "e"]);
    expect((container.children[0] as HTMLElement).dataset.pass).toBe("2");
  });

  it("removes foreign (non-keyed) children before diffing", () => {
    const stranger = document.createElement("p");
    stranger.textContent = "empty state";
    container.appendChild(stranger);
    const { factory } = makeFactory();
    applyDiff(container, ["a"], factory, noopUpdater);
    expect(keysOf(container)).toEqual(["a"]);
    expect(container.contains(stranger)).toBe(false);
  });
});
