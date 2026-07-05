// @vitest-environment happy-dom
/**
 * Shell composition test. Like TabPanel's own suite, this deliberately does
 * NOT wait for a feature's lazy `import()` to settle — pulling in a real
 * feature module would make this a coupled integration test. The point here
 * is App's own composition: tab bar + current panel + busy bar + footer are
 * all present, and the footer is shell chrome (rendered once, not per-tab
 * feature content) — the actual bug this shell placement fixed.
 */
import { afterEach, describe, expect, it } from "vitest";
import { h } from "preact";
import { cleanup, render } from "@testing-library/preact";
import { activeTab } from "../shared/model";
import { _resetHostBusy, hostBusy } from "../shared/model/hostBusy";
import { App } from "./App";

afterEach(() => {
  cleanup();
  activeTab.value = "sessions";
  _resetHostBusy();
});

describe("App", () => {
  it("renders the tab bar and the current tab's panel", () => {
    const { container } = render(h(App, {}));
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    // sessions is the default active tab; its lazy panel hasn't resolved yet,
    // so the content-aware skeleton paints (TabPanel's own contract).
    expect(container.querySelector(".skeleton-actions")).toBeTruthy();
  });

  it("switches panels when a different tab is activated", () => {
    activeTab.value = "agents";
    const { container } = render(h(App, {}));
    const activeTabBtn = container.querySelector('[data-tab="agents"]');
    expect(activeTabBtn?.getAttribute("aria-selected")).toBe("true");
  });

  it("renders the footer once, as shell chrome — not tied to any one tab", () => {
    for (const id of ["sessions", "agents", "config"]) {
      activeTab.value = id;
      const { container, unmount } = render(h(App, {}));
      expect(container.querySelector(".app-footer")).toBeTruthy();
      expect(container.querySelector(".footer-name")?.textContent).toBe("Claude Code Manager");
      unmount();
    }
  });

  it("hides the host-busy bar by default", () => {
    const { container } = render(h(App, {}));
    expect(container.querySelector(".host-busy-bar")).toBeNull();
  });

  it("shows the host-busy bar while a host request is outstanding", () => {
    hostBusy.value = true;
    const { container } = render(h(App, {}));
    expect(container.querySelector('.host-busy-bar[role="progressbar"]')).toBeTruthy();
  });
});
