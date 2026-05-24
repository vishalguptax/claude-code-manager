// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { h } from "preact";
import { useRef } from "preact/hooks";
import { useDismiss, type UseDismissOptions } from "../useDismiss";

/**
 * A harness that mounts a content element (the "surface") plus an optional
 * anchor/ignore element, wiring both into useDismiss. Exposed test ids let the
 * specs press inside/outside each region.
 */
function Harness(props: {
  open: boolean;
  onDismiss: () => void;
  outsidePress?: boolean;
  withAnchor?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const opts: UseDismissOptions = {
    open: props.open,
    onDismiss: props.onDismiss,
    contentRef,
    ignore: props.withAnchor ? [anchorRef] : undefined,
    outsidePress: props.outsidePress,
  };
  useDismiss(opts);
  return h("div", {}, [
    h("button", { ref: anchorRef, "data-testid": "anchor", key: "a" }, "anchor"),
    h("div", { ref: contentRef, "data-testid": "content", key: "c" }, "surface"),
    h("div", { "data-testid": "outside", key: "o" }, "outside"),
  ]);
}

describe("useDismiss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // happy-dom's window blur is dispatched directly: fireEvent.blur targets
  // focus semantics on elements, but the hook listens on `window`.
  const blurWindow = (): void => {
    window.dispatchEvent(new Event("blur"));
  };

  it("does not attach listeners while closed", () => {
    const onDismiss = vi.fn();
    render(h(Harness, { open: false, onDismiss }));
    vi.advanceTimersByTime(1);
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document, { key: "Escape" });
    blurWindow();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses on a pointerdown outside the content (after the open-tick defer)", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(h(Harness, { open: true, onDismiss }));
    vi.advanceTimersByTime(1);
    fireEvent.pointerDown(getByTestId("outside"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does NOT dismiss on a pointerdown that lands before the open-tick defer", () => {
    // The same press that opened the surface must not immediately close it.
    const onDismiss = vi.fn();
    const { getByTestId } = render(h(Harness, { open: true, onDismiss }));
    // No timer advance — listener not yet attached.
    fireEvent.pointerDown(getByTestId("outside"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does NOT dismiss on a pointerdown inside the content", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(h(Harness, { open: true, onDismiss }));
    vi.advanceTimersByTime(1);
    fireEvent.pointerDown(getByTestId("content"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does NOT dismiss on a pointerdown on an ignored (anchor) element", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(h(Harness, { open: true, onDismiss, withAnchor: true }));
    vi.advanceTimersByTime(1);
    fireEvent.pointerDown(getByTestId("anchor"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses on an outside pointerdown when an anchor is configured but not pressed", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(h(Harness, { open: true, onDismiss, withAnchor: true }));
    vi.advanceTimersByTime(1);
    fireEvent.pointerDown(getByTestId("outside"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", () => {
    const onDismiss = vi.fn();
    render(h(Harness, { open: true, onDismiss }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape keys", () => {
    const onDismiss = vi.fn();
    render(h(Harness, { open: true, onDismiss }));
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "a" });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses on window blur (webview loses focus)", () => {
    const onDismiss = vi.fn();
    render(h(Harness, { open: true, onDismiss }));
    blurWindow();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("with outsidePress=false, ignores outside pointerdown but still honors Escape + blur", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(
      h(Harness, { open: true, onDismiss, outsidePress: false }),
    );
    vi.advanceTimersByTime(1);
    fireEvent.pointerDown(getByTestId("outside"));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    blurWindow();
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("removes all listeners (and clears the pending timeout) on close", () => {
    const onDismiss = vi.fn();
    const { rerender, getByTestId } = render(h(Harness, { open: true, onDismiss }));
    vi.advanceTimersByTime(1);
    rerender(h(Harness, { open: false, onDismiss }));
    fireEvent.pointerDown(getByTestId("outside"));
    fireEvent.keyDown(document, { key: "Escape" });
    blurWindow();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("clears the deferred-attach timeout if closed before the tick elapses", () => {
    // Closing within the same tick must not leave a dangling listener that
    // attaches after unmount.
    const onDismiss = vi.fn();
    const { rerender, getByTestId } = render(h(Harness, { open: true, onDismiss }));
    rerender(h(Harness, { open: false, onDismiss }));
    vi.advanceTimersByTime(1);
    fireEvent.pointerDown(getByTestId("outside"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("reads the latest onDismiss without re-attaching listeners (stable subscription)", () => {
    // A fresh inline onDismiss each render must be the one invoked, proving the
    // hook reads through a holder rather than capturing the first closure.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(h(Harness, { open: true, onDismiss: first }));
    rerender(h(Harness, { open: true, onDismiss: second }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
