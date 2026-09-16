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
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { activeTab, density, hiddenTabsPref, tabOrderPref } from "../shared/model";
import { _resetPaletteSources } from "../shared/model/palette";
import { TABS } from "./tabs/tabRegistry";
import { _resetHostBusy, hostBusy } from "../shared/model/hostBusy";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(() => {
  cleanup();
  activeTab.value = "sessions";
  density.value = "comfortable";
  hiddenTabsPref.value = [];
  tabOrderPref.value = [];
  _resetHostBusy();
  _resetPaletteSources();
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

  // ── Density ─────────────────────────────────────────────────────
  // The `claudeManager.density` setting reaches CSS as one attribute on the
  // shell wrapper. Every quiet-mode rule in density.css is written as
  // `[data-density="quiet"] .row-class`, so if the attribute stops being
  // rendered the whole variant silently stops applying with nothing failing.

  it("stamps the current density on the shell wrapper", () => {
    const { container } = render(h(App, {}));
    expect(container.querySelector('.app-shell[data-density="comfortable"]')).toBeTruthy();
  });

  it("re-stamps the wrapper when the density signal changes", () => {
    density.value = "quiet";
    const { container } = render(h(App, {}));
    expect(container.querySelector('.app-shell[data-density="quiet"]')).toBeTruthy();
  });

  // The wrapper is display:contents, so it must not sit between #root and the
  // shell chrome in any way that changes layout — everything still renders
  // inside it, and there is exactly one of it.
  // ── Command palette ─────────────────────────────────────────────
  // Eight tabs, each with a search box that only searches itself. Cmd/Ctrl+K
  // is the way out of a tab-scoped search into a global one, so it has to work
  // from anywhere — including from inside a feature's own input.

  it("has no palette open at rest", () => {
    const { container } = render(h(App, {}));
    expect(container.querySelector(".palette")).toBeNull();
  });

  it("opens and closes the palette on Cmd+K", () => {
    const { container } = render(h(App, {}));
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(container.querySelector(".palette")).toBeTruthy();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(container.querySelector(".palette")).toBeNull();
  });

  it("opens the palette on Ctrl+K too", () => {
    const { container } = render(h(App, {}));
    fireEvent.keyDown(document, { key: "K", ctrlKey: true });
    expect(container.querySelector(".palette")).toBeTruthy();
  });

  it("ignores a bare k, so typing in a search box is unaffected", () => {
    const { container } = render(h(App, {}));
    fireEvent.keyDown(document, { key: "k" });
    expect(container.querySelector(".palette")).toBeNull();
  });

  // A tab the user has never opened has not mounted and so has registered no
  // items. Navigation is always there, which is the answer you want in exactly
  // that case: you cannot search a tab you have not opened, but you can go to it.
  it("always offers navigation to every tab", () => {
    const { container } = render(h(App, {}));
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const titles = Array.from(container.querySelectorAll(".palette-item-title")).map(
      (n) => n.textContent,
    );
    for (const tab of TABS) expect(titles).toContain(tab.label);
  });

  it("switches tabs when a navigation item is chosen", () => {
    const { container } = render(h(App, {}));
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const row = Array.from(container.querySelectorAll<HTMLElement>(".palette-item")).find(
      (r) => r.textContent?.includes("Config"),
    );
    fireEvent.mouseDown(row as HTMLElement);
    expect(activeTab.value).toBe("config");
    expect(container.querySelector(".palette")).toBeNull();
  });

  // A tab hidden via claudeManager.hiddenTabs is not just off the strip — it
  // must not offer a back door through "Go to" either, or hiding it would
  // just relocate the clutter rather than remove it.
  it("does not offer navigation to a hidden tab", () => {
    hiddenTabsPref.value = ["checkpoints", "prompts"];
    const { container } = render(h(App, {}));
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const titles = Array.from(container.querySelectorAll(".palette-item-title")).map(
      (n) => n.textContent,
    );
    expect(titles).not.toContain("Checkpoints");
    expect(titles).not.toContain("Prompts");
    expect(titles).toContain("Sessions");
  });

  // ── Crash containment ────────────────────────────────────────────
  // The boundary wraps the FEATURE, not the shell. It used to wrap everything,
  // so one render error in one tab replaced the tab bar with "Something went
  // wrong" and the only way out was reloading the window.

  it("keeps the tab bar and footer alive when a feature crashes", () => {
    const boom = () => {
      throw new Error("feature exploded");
    };
    const { container } = render(
      h(ErrorBoundary, { key: "sessions" }, h(boom as never, {})),
    );
    expect(container.querySelector(".empty-state-title")?.textContent).toBe(
      "Something went wrong",
    );

    // And in the shell: the boundary sits inside .tab-content, below the strip.
    const app = render(h(App, {}));
    const boundaryHost = app.container.querySelector(".tab-content");
    expect(boundaryHost).toBeTruthy();
    expect(app.container.querySelector('[role="tablist"]')).toBeTruthy();
    expect(app.container.querySelector(".app-footer")).toBeTruthy();
  });

  it("keeps the shell chrome inside the single wrapper", () => {
    const { container } = render(h(App, {}));
    const shells = container.querySelectorAll(".app-shell");
    expect(shells.length).toBe(1);
    const shell = shells[0];
    expect(shell.querySelector('[role="tablist"]')).toBeTruthy();
    expect(shell.querySelector(".tab-content-area")).toBeTruthy();
    expect(shell.querySelector(".app-footer")).toBeTruthy();
  });
});
