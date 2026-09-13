// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { findScroller, keepAnchored } from "../anchorScroll";

/**
 * happy-dom has no layout, so the two things the helper reads are stubbed: the
 * anchor's position (which the caller's mutation is expected to change) and
 * the candidate scrollers' overflow and size.
 */
function scroller({ scrollHeight = 1000, clientHeight = 500, overflowY = "auto" } = {}) {
  const el = document.createElement("div");
  el.style.overflowY = overflowY;
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  el.scrollTop = 0;
  document.body.appendChild(el);
  return el;
}

/** An anchor whose reported top changes when `move` is called. */
function anchorIn(parent: HTMLElement, top: number) {
  const el = document.createElement("header");
  let current = top;
  el.getBoundingClientRect = () => ({ top: current }) as DOMRect;
  parent.appendChild(el);
  return { el, move: (to: number) => { current = to; } };
}

const frame = (): void => {
  // The correction is deferred a frame; run it synchronously in tests.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("findScroller", () => {
  it("finds the nearest ancestor that actually scrolls", () => {
    const outer = scroller();
    const inner = document.createElement("div");
    outer.appendChild(inner);
    const leaf = document.createElement("span");
    inner.appendChild(leaf);
    expect(findScroller(leaf)).toBe(outer);
  });

  it("skips an overflow container with nothing to scroll", () => {
    // Every feature panel sets overflow-y: auto, so matching on overflow alone
    // would pick one whose offset cannot move.
    const real = scroller();
    const idle = scroller({ scrollHeight: 400, clientHeight: 400 });
    real.appendChild(idle);
    const leaf = document.createElement("span");
    idle.appendChild(leaf);
    expect(findScroller(leaf)).toBe(real);
  });

  it("ignores a visible-overflow ancestor", () => {
    const plain = scroller({ overflowY: "visible" });
    const leaf = document.createElement("span");
    plain.appendChild(leaf);
    expect(findScroller(leaf)).toBeNull();
  });

  it("returns null for a detached element", () => {
    expect(findScroller(document.createElement("div"))).toBeNull();
  });
});

describe("keepAnchored", () => {
  it("moves the scroll offset by however far the anchor drifted", () => {
    frame();
    const box = scroller();
    box.scrollTop = 260;
    const { el, move } = anchorIn(box, 115);

    keepAnchored(el, () => move(375)); // the Account Usage case: 260px of drift

    expect(box.scrollTop).toBe(520);
  });

  it("pulls the offset back when the anchor rises", () => {
    frame();
    const box = scroller();
    box.scrollTop = 300;
    const { el, move } = anchorIn(box, 200);

    keepAnchored(el, () => move(140));

    expect(box.scrollTop).toBe(240);
  });

  it("leaves the offset alone when nothing moved", () => {
    frame();
    const box = scroller();
    box.scrollTop = 120;
    const { el } = anchorIn(box, 200);

    keepAnchored(el, () => {});

    expect(box.scrollTop).toBe(120);
  });

  it("ignores sub-pixel drift rather than fighting native anchoring", () => {
    frame();
    const box = scroller();
    box.scrollTop = 120;
    const { el, move } = anchorIn(box, 200);

    keepAnchored(el, () => move(200.3));

    expect(box.scrollTop).toBe(120);
  });

  it("still performs the mutation with no scrollable ancestor", () => {
    frame();
    const plain = scroller({ overflowY: "visible" });
    const { el, move } = anchorIn(plain, 100);
    const mutate = vi.fn(() => move(400));

    keepAnchored(el, mutate);

    expect(mutate).toHaveBeenCalledOnce();
  });

  it("still performs the mutation with no anchor", () => {
    const mutate = vi.fn();
    keepAnchored(null, mutate);
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("corrects immediately where there is no animation frame", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const box = scroller();
    box.scrollTop = 50;
    const { el, move } = anchorIn(box, 100);

    keepAnchored(el, () => move(130));

    expect(box.scrollTop).toBe(80);
  });
});
