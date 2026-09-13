// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { useRef } from "preact/hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEdgeAutoScroll } from "../useEdgeAutoScroll";

/**
 * happy-dom has no layout, so the strip's geometry is stubbed: a 100px-wide
 * box at x=0 holding 500px of content. Everything the hook decides comes from
 * those numbers plus the pointer's clientX.
 */
function Strip({ enabled }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEdgeAutoScroll(ref, { enabled });
  return <div ref={ref} data-testid="strip" />;
}

const BOX = { left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20 };

function setup(opts: { scrollWidth?: number; enabled?: boolean } = {}) {
  const { container } = render(<Strip enabled={opts.enabled} />);
  const el = container.querySelector<HTMLDivElement>("[data-testid=strip]");
  if (!el) throw new Error("strip not rendered");
  Object.defineProperty(el, "clientWidth", { value: 100, configurable: true });
  Object.defineProperty(el, "scrollWidth", {
    value: opts.scrollWidth ?? 500,
    configurable: true,
  });
  el.getBoundingClientRect = () => ({ ...BOX, x: 0, y: 0, toJSON: () => "" }) as DOMRect;
  el.scrollLeft = 50;
  return el;
}

function point(el: HTMLElement, clientX: number): void {
  el.dispatchEvent(new PointerEvent("pointermove", { clientX, bubbles: true }));
}

describe("useEdgeAutoScroll", () => {
  // The scroll loop reschedules itself, so frames are captured and run one at
  // a time by `frame()` rather than fired synchronously on request — a stub
  // that called straight through would recurse until the stack gave out.
  let pending: FrameRequestCallback | null = null;
  const frame = (): void => {
    const cb = pending;
    pending = null;
    cb?.(0);
  };

  beforeEach(() => {
    pending = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pending = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      pending = null;
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrolls right when the pointer rests near the right edge", () => {
    const el = setup();
    point(el, 98);
    frame();
    expect(el.scrollLeft).toBeGreaterThan(50);
  });

  it("scrolls left when the pointer rests near the left edge", () => {
    const el = setup();
    point(el, 2);
    frame();
    expect(el.scrollLeft).toBeLessThan(50);
  });

  it("stays put while the pointer is in the middle", () => {
    const el = setup();
    point(el, 50);
    frame();
    expect(el.scrollLeft).toBe(50);
  });

  it("pulls harder the deeper into the edge zone the pointer is", () => {
    const near = setup();
    point(near, 80); // just inside the 36px zone
    frame();
    const gentle = near.scrollLeft - 50;

    const deep = setup();
    point(deep, 100); // hard against the edge
    frame();
    const strong = deep.scrollLeft - 50;

    expect(strong).toBeGreaterThan(gentle);
  });

  it("does nothing when there is nothing to scroll to", () => {
    const el = setup({ scrollWidth: 100 });
    point(el, 98);
    frame();
    expect(el.scrollLeft).toBe(50);
  });

  it("does nothing when disabled", () => {
    const el = setup({ enabled: false });
    point(el, 98);
    frame();
    expect(el.scrollLeft).toBe(50);
  });

  it("respects prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const el = setup();
    point(el, 98);
    frame();
    expect(el.scrollLeft).toBe(50);
  });

  it("stops scrolling once the pointer leaves the strip", () => {
    const el = setup();
    point(el, 98);
    frame();
    const afterMove = el.scrollLeft;
    el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    frame();
    expect(el.scrollLeft).toBe(afterMove);
  });
});
