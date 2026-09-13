// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findScroller, keepAnchored } from "../anchorScroll";

/**
 * happy-dom has no layout, so the scroller is modelled directly — and modelled
 * as a REAL one: `scrollTop` clamps to the content, and `scrollHeight` grows
 * with any padding the helper adds. Both matter. The first version of this
 * helper passed a stub without clamping and still failed in the panel, because
 * clamping is the entire problem it exists to undo.
 */
function scroller({ content = 1000, clientHeight = 500, overflowY = "auto" } = {}) {
  const el = document.createElement("div");
  el.style.overflowY = overflowY;
  let height = content;
  let top = 0;

  const scrollHeight = (): number => height + (Number.parseFloat(el.style.paddingBottom) || 0);
  Object.defineProperty(el, "scrollHeight", { get: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (next: number) => {
      top = Math.max(0, Math.min(next, Math.max(scrollHeight() - clientHeight, 0)));
    },
    configurable: true,
  });

  document.body.appendChild(el);
  return Object.assign(el, {
    /** Collapse/expand: change the content height, then clamp like a browser. */
    setContentHeight(next: number) {
      height = next;
      el.scrollTop = top;
    },
  });
}

/** An anchor whose reported top follows the scroller's offset, as a real row does. */
function anchorIn(box: HTMLElement & { setContentHeight(n: number): void }, documentTop: number) {
  const el = document.createElement("header");
  let docTop = documentTop;
  el.getBoundingClientRect = () => ({ top: docTop - box.scrollTop }) as DOMRect;
  box.appendChild(el);
  return { el, moveInDocument: (to: number) => { docTop = to; } };
}

/**
 * The correction is scheduled on timers rather than animation frames, so that
 * an occluded webview — which gets no frames at all — still corrects. Tests
 * drive those timers directly.
 */
function settle(): void {
  vi.advanceTimersByTime(16 * 12);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
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
    const idle = scroller({ content: 400, clientHeight: 400 });
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
  it("holds the header still when the collapse clamps the offset", () => {
    // The Account case: 1345px of content in a 570px panel, scrolled to 260,
    // collapsing Usage leaves 570px — so the offset would be forced to 0.
    const box = scroller({ content: 1345, clientHeight: 570 });
    box.scrollTop = 260;
    const { el } = anchorIn(box, 375);
    expect(el.getBoundingClientRect().top).toBe(115);

    keepAnchored(el, () => box.setContentHeight(570));

    settle();

    expect(box.scrollTop).toBe(260);
    expect(el.getBoundingClientRect().top).toBe(115);
    expect(Number.parseFloat(box.style.paddingBottom)).toBeGreaterThan(0);
  });

  it("opens exactly the room the offset needs, shortfall included", () => {
    // 380px of content left in a 570px panel at offset 260: the offset cannot
    // move until the 190px shortfall is covered too, so 450px is needed. A
    // formula that measures from the current maximum offset asks for 260,
    // under-provisions, and only lands by accident on a second pass.
    const box = scroller({ content: 1345, clientHeight: 570 });
    box.scrollTop = 260;
    const { el } = anchorIn(box, 375);

    keepAnchored(el, () => box.setContentHeight(380));

    settle();

    expect(Number.parseFloat(box.style.paddingBottom)).toBe(450);
    expect(box.scrollTop).toBe(260);
    expect(el.getBoundingClientRect().top).toBe(115);
  });

  it("needs no room when the content still overflows", () => {
    const box = scroller({ content: 1345, clientHeight: 570 });
    box.scrollTop = 260;
    const { el } = anchorIn(box, 375);

    keepAnchored(el, () => box.setContentHeight(1200));

    settle();

    expect(box.scrollTop).toBe(260);
    expect(el.getBoundingClientRect().top).toBe(115);
    expect(box.style.paddingBottom).toBe("");
  });

  it("follows the anchor when something above it changes height", () => {
    const box = scroller({ content: 1345, clientHeight: 570 });
    box.scrollTop = 300;
    const a = anchorIn(box, 500);
    expect(a.el.getBoundingClientRect().top).toBe(200);

    // A section above collapses by 60px, carrying this header up with it.
    keepAnchored(a.el, () => a.moveInDocument(440));
    settle();

    expect(a.el.getBoundingClientRect().top).toBe(200);
    expect(box.scrollTop).toBe(240);
  });

  it("never opens more than one screenful", () => {
    const box = scroller({ content: 4000, clientHeight: 300 });
    box.scrollTop = 3000;
    const { el } = anchorIn(box, 3100);

    keepAnchored(el, () => box.setContentHeight(300));

    settle();

    expect(Number.parseFloat(box.style.paddingBottom)).toBeLessThanOrEqual(300);
  });

  it("gives the room back once the user scrolls to the end of real content", () => {
    const box = scroller({ content: 1345, clientHeight: 570 });
    box.scrollTop = 260;
    const { el } = anchorIn(box, 375);
    keepAnchored(el, () => box.setContentHeight(570));
    settle();
    expect(Number.parseFloat(box.style.paddingBottom)).toBeGreaterThan(0);

    box.scrollTop = 0;
    box.dispatchEvent(new Event("scroll"));

    expect(box.style.paddingBottom).toBe("");
  });

  it("gives the room back when the content grows again", () => {
    const box = scroller({ content: 1345, clientHeight: 570 });
    box.scrollTop = 260;
    const { el } = anchorIn(box, 375);
    keepAnchored(el, () => box.setContentHeight(570));
    settle();
    expect(Number.parseFloat(box.style.paddingBottom)).toBeGreaterThan(0);

    keepAnchored(el, () => box.setContentHeight(1345));

    settle();

    expect(box.style.paddingBottom).toBe("");
    expect(box.scrollTop).toBe(260);
  });

  it("preserves the element's own padding when it releases the room", () => {
    const box = scroller({ content: 1345, clientHeight: 570 });
    box.style.paddingBottom = "12px";
    box.scrollTop = 260;
    const { el } = anchorIn(box, 375);

    keepAnchored(el, () => box.setContentHeight(570));

    settle();
    expect(Number.parseFloat(box.style.paddingBottom)).toBeGreaterThan(12);

    box.scrollTop = 0;
    box.dispatchEvent(new Event("scroll"));
    expect(box.style.paddingBottom).toBe("12px");
  });

  it("leaves an unscrolled panel alone", () => {
    const box = scroller({ content: 1345, clientHeight: 570 });
    const { el } = anchorIn(box, 100);

    keepAnchored(el, () => box.setContentHeight(570));

    settle();

    expect(box.scrollTop).toBe(0);
    expect(box.style.paddingBottom).toBe("");
  });

  it("still performs the mutation with no scrollable ancestor", () => {
    const plain = scroller({ overflowY: "visible" });
    const { el } = anchorIn(plain, 100);
    const mutate = vi.fn();

    keepAnchored(el, mutate);

    settle();

    expect(mutate).toHaveBeenCalledOnce();
  });

  it("still performs the mutation with no anchor", () => {
    const mutate = vi.fn();
    keepAnchored(null, mutate);
    settle();
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("corrects even when no frame is ever painted", () => {
    // An occluded webview gets no rAF callbacks; timers still fire.
    vi.stubGlobal("requestAnimationFrame", undefined);
    const box = scroller({ content: 1345, clientHeight: 570 });
    box.scrollTop = 260;
    const { el } = anchorIn(box, 375);

    keepAnchored(el, () => box.setContentHeight(570));

    settle();

    expect(box.scrollTop).toBe(260);
  });
});
