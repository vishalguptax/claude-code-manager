// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { TabBar } from "../TabBar";
import { activeTab } from "../../../shared/model";
import { TABS } from "../tabRegistry";

describe("TabBar", () => {
  beforeEach(() => {
    activeTab.value = "sessions";
  });

  it("renders a tablist with one role=tab button per registered tab", () => {
    const { container } = render(<TabBar />);
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    expect(container.querySelectorAll('[role="tab"]').length).toBe(TABS.length);
  });

  it("renders the global reload button outside the tablist", () => {
    const { container } = render(<TabBar />);
    const reload = container.querySelector("button.tab-reload-btn");
    expect(reload).toBeTruthy();
    // The reload affordance is global chrome, not a tab — it must not sit
    // inside the role=tablist (that would break the ARIA pattern).
    expect(reload?.closest('[role="tablist"]')).toBeNull();
  });

  it("marks the active tab selected and gives only it tabindex 0 (roving)", () => {
    const { container } = render(<TabBar />);
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const active = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    expect(active?.dataset.tab).toBe("sessions");
    expect(active?.getAttribute("tabindex")).toBe("0");
    expect(tabs.filter((t) => t !== active).every((t) => t.getAttribute("tabindex") === "-1")).toBe(
      true,
    );
  });

  it("activates a tab on click", () => {
    const { container } = render(<TabBar />);
    const skills = container.querySelector<HTMLButtonElement>('[data-tab="skills"]');
    fireEvent.click(skills as HTMLButtonElement);
    expect(activeTab.value).toBe("skills");
  });

  it("ArrowRight moves selection to the next tab (no focus trap)", () => {
    const { container } = render(<TabBar />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(activeTab.value).toBe(TABS[1].id);
  });

  it("ArrowLeft from the first tab wraps to the last", () => {
    const { container } = render(<TabBar />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(activeTab.value).toBe(TABS[TABS.length - 1].id);
  });

  it("Home selects the first tab and End the last", () => {
    activeTab.value = "mcp";
    const { container } = render(<TabBar />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    fireEvent.keyDown(list, { key: "Home" });
    expect(activeTab.value).toBe(TABS[0].id);
    fireEvent.keyDown(list, { key: "End" });
    expect(activeTab.value).toBe(TABS[TABS.length - 1].id);
  });

  // ── Icon rail ──────────────────────────────────────────────────
  // Only the active tab spells its label (CSS hides the rest), so the
  // accessible name has to come from somewhere that is NOT the label. Every
  // tab keeps aria-label + title regardless of state; without those, seven of
  // eight tabs would be unnamed to a screen reader and untitled on hover.

  it("gives every tab an accessible name and a tooltip, active or not", () => {
    const { container } = render(<TabBar />);
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.length).toBe(TABS.length);
    for (const tab of tabs) {
      const expected = TABS.find((t) => t.id === tab.dataset.tab)?.label;
      expect(tab.getAttribute("aria-label")).toBe(expected);
      expect(tab.getAttribute("title")).toBe(expected);
    }
  });

  it("still renders the label element for every tab (CSS, not markup, hides it)", () => {
    const { container } = render(<TabBar />);
    const labels = Array.from(container.querySelectorAll(".tab-label")).map((n) => n.textContent);
    expect(labels).toEqual(TABS.map((t) => t.label));
  });

  it("scrolls the active tab into view so a narrowed strip never clips it", () => {
    activeTab.value = "sessions";
    const { container } = render(<TabBar />);
    const config = container.querySelector<HTMLButtonElement>('[data-tab="config"]');
    const calls: unknown[] = [];
    (config as HTMLButtonElement).scrollIntoView = (arg?: unknown) => {
      calls.push(arg);
    };
    fireEvent.click(config as HTMLButtonElement);
    expect(activeTab.value).toBe("config");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toMatchObject({ block: "nearest", inline: "nearest" });
  });

  it("does not throw when the host DOM has no scrollIntoView", () => {
    activeTab.value = "sessions";
    const { container } = render(<TabBar />);
    const mcp = container.querySelector<HTMLButtonElement>('[data-tab="mcp"]');
    // Simulate a DOM implementation that omits the method entirely.
    (mcp as unknown as { scrollIntoView?: unknown }).scrollIntoView = undefined;
    expect(() => fireEvent.click(mcp as HTMLButtonElement)).not.toThrow();
    expect(activeTab.value).toBe("mcp");
  });
});
