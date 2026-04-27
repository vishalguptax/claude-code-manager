// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted spy so the api module mock can capture calls before the
// demo module imports it.
const sendMarkDemoSeen = vi.hoisted(() => vi.fn());

vi.mock("../../features/sessions/webview/api", () => ({
  sendMarkDemoSeen,
}));

// Demo module holds module-level state (`_running`, `_autoPlayedThisSession`).
// Re-import via dynamic loader after `vi.resetModules` so each test gets a
// pristine copy of those flags.
type DemoModule = typeof import("../demo");
let demo: DemoModule;
let disposers: Array<() => void> = [];

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  sendMarkDemoSeen.mockClear();
  // Tear down any document-level listeners installed by the previous
  // test so click counters don't bleed across cases.
  for (const d of disposers) d();
  disposers = [];
  document.body.innerHTML = "";
  demo = await import("../demo");
});

describe("bindDemoReplay", () => {
  it("plays the demo on triple-click of the footer brand", () => {
    disposers.push(demo.bindDemoReplay());

    const footer = document.createElement("span");
    footer.className = "footer-name";
    document.body.appendChild(footer);

    footer.click();
    footer.click();
    footer.click();

    // Demo overlay is appended to document.body when it runs.
    expect(document.getElementById("cm-demo-overlay")).not.toBeNull();
  });

  it("does not play on a single click", () => {
    disposers.push(demo.bindDemoReplay());
    const footer = document.createElement("span");
    footer.className = "footer-name";
    document.body.appendChild(footer);

    footer.click();
    expect(document.getElementById("cm-demo-overlay")).toBeNull();
  });

  it("ignores clicks outside the footer brand", () => {
    disposers.push(demo.bindDemoReplay());
    const other = document.createElement("button");
    document.body.appendChild(other);

    other.click();
    other.click();
    other.click();
    expect(document.getElementById("cm-demo-overlay")).toBeNull();
  });

  it("resets the click counter after the 600ms window", () => {
    disposers.push(demo.bindDemoReplay());
    const footer = document.createElement("span");
    footer.className = "footer-name";
    document.body.appendChild(footer);

    footer.click();
    footer.click();
    vi.advanceTimersByTime(700);
    footer.click();
    expect(document.getElementById("cm-demo-overlay")).toBeNull();
  });
});

describe("maybePlayDemoOnce", () => {
  it("plays the demo and posts markDemoSeen when seen=false", () => {
    demo.maybePlayDemoOnce(false);

    // Auto-play is delayed 900ms so the sidebar paints first.
    vi.advanceTimersByTime(950);

    expect(document.getElementById("cm-demo-overlay")).not.toBeNull();
    expect(sendMarkDemoSeen).toHaveBeenCalledTimes(1);
  });

  it("does nothing when seen=true", () => {
    demo.maybePlayDemoOnce(true);
    vi.advanceTimersByTime(2000);

    expect(document.getElementById("cm-demo-overlay")).toBeNull();
    expect(sendMarkDemoSeen).not.toHaveBeenCalled();
  });

  it("self-suppresses on subsequent calls in the same session", () => {
    // First call (seen=false) auto-plays.
    demo.maybePlayDemoOnce(false);
    vi.advanceTimersByTime(950);
    const overlay1 = document.getElementById("cm-demo-overlay");
    expect(overlay1).not.toBeNull();

    // Remove the overlay manually to simulate the user dismissing.
    overlay1?.remove();

    // A second `settings` message arriving with seen=false (e.g. the
    // host posted before its globalState write completed) must NOT
    // re-trigger the cinematic.
    demo.maybePlayDemoOnce(false);
    vi.advanceTimersByTime(2000);

    expect(document.getElementById("cm-demo-overlay")).toBeNull();
    expect(sendMarkDemoSeen).toHaveBeenCalledTimes(1);
  });
});
