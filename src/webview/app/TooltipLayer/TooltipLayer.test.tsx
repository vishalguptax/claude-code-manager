// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipLayer } from "./TooltipLayer";

/** An icon-only button always qualifies, so it isolates the timing behaviour. */
function iconButton(title: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.title = title;
  btn.innerHTML = "<svg></svg>";
  Object.defineProperty(btn, "scrollWidth", { value: 24, configurable: true });
  Object.defineProperty(btn, "clientWidth", { value: 24, configurable: true });
  btn.getBoundingClientRect = () =>
    ({ left: 10, right: 34, top: 10, bottom: 34, width: 24, height: 24 }) as DOMRect;
  document.body.appendChild(btn);
  return btn;
}

const hover = (el: Element): void => {
  el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
};

const tooltip = (): HTMLElement | null => document.querySelector(".tooltip");

/**
 * Preact batches state updates, so a setTip() from a timer callback lands a
 * microtask later. Advancing asynchronously lets that flush before asserting.
 */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

/** A hover that shows without a timer still needs the render to flush. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("TooltipLayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    render(<TooltipLayer />);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("does not appear immediately on hover", async () => {
    // Moving the pointer ACROSS a control on the way elsewhere must not
    // trigger a tooltip.
    hover(iconButton("Refresh sessions"));
    await advance(300);
    expect(tooltip()).toBeNull();
  });

  it("appears after the dwell", async () => {
    hover(iconButton("Refresh sessions"));
    await advance(600);
    expect(tooltip()?.textContent).toBe("Refresh sessions");
  });

  it("suppresses the native tooltip only while it owns the title", async () => {
    const btn = iconButton("Refresh sessions");
    hover(btn);
    await advance(600);
    expect(btn.hasAttribute("title")).toBe(false);
    expect(btn.getAttribute("data-title")).toBe("Refresh sessions");

    hover(document.body);
    await flush();
    expect(btn.getAttribute("title")).toBe("Refresh sessions");
    expect(btn.hasAttribute("data-title")).toBe(false);
  });

  it("leaves the title alone for a control that does not qualify", async () => {
    // A fully-visible label whose title repeats it: no styled tooltip, and the
    // native one is left intact rather than silently disabled.
    const span = document.createElement("span");
    span.title = "Release 2.9.0 notes";
    span.textContent = "Release 2.9.0 notes";
    Object.defineProperty(span, "scrollWidth", { value: 100, configurable: true });
    Object.defineProperty(span, "clientWidth", { value: 100, configurable: true });
    document.body.appendChild(span);

    hover(span);
    await advance(1000);
    expect(tooltip()).toBeNull();
    expect(span.getAttribute("title")).toBe("Release 2.9.0 notes");
  });

  it("answers immediately while sweeping a toolbar", async () => {
    // First one costs the dwell; a neighbour hovered inside the grace window
    // shows at once, so scanning a row of icons is not four waits.
    hover(iconButton("Refresh sessions"));
    await advance(600);
    expect(tooltip()).not.toBeNull();

    const second = iconButton("Filter sessions");
    hover(second);
    await flush();
    expect(tooltip()?.textContent).toBe("Filter sessions");
  });

  it("charges the full dwell again once the grace window has passed", async () => {
    hover(iconButton("Refresh sessions"));
    await advance(600);
    hover(document.body);

    await advance(500); // longer than the grace window
    hover(iconButton("Filter sessions"));
    expect(tooltip()).toBeNull();
    await advance(600);
    expect(tooltip()?.textContent).toBe("Filter sessions");
  });

  it("dismisses on click and on keypress", async () => {
    const btn = iconButton("Refresh sessions");
    hover(btn);
    await advance(600);
    expect(tooltip()).not.toBeNull();

    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await flush();
    expect(tooltip()).toBeNull();
    expect(btn.getAttribute("title")).toBe("Refresh sessions");

    hover(btn);
    await advance(600);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    await flush();
    expect(tooltip()).toBeNull();
  });

  it("drops the tooltip when the page scrolls under it", async () => {
    hover(iconButton("Refresh sessions"));
    await advance(600);
    document.dispatchEvent(new Event("scroll", { bubbles: true }));
    await flush();
    expect(tooltip()).toBeNull();
  });
});
