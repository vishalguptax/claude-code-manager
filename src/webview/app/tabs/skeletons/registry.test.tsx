// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it } from "vitest";
import { TABS } from "../tabRegistry";
import { resolveTabSkeleton, tabSkeletons } from "./registry";

/** Render `Component` and return the rendered root container for assertion. */
function renderComponent(Component: ReturnType<typeof resolveTabSkeleton>) {
  return render(h(Component, {})).container;
}

describe("tabSkeletons registry", () => {
  it("covers every feature id in the TabBar so lazy-load never falls back to a generic loader", () => {
    for (const tab of TABS) {
      expect(tabSkeletons[tab.id], `missing skeleton for tab "${tab.id}"`).toBeTruthy();
    }
  });

  it("returns the bespoke shapes for the three tabs with their own layouts", () => {
    expect(renderComponent(resolveTabSkeleton("sessions")).querySelector(".skeleton-actions")).toBeTruthy();
    expect(renderComponent(resolveTabSkeleton("account")).querySelector(".skeleton-profile")).toBeTruthy();
    expect(renderComponent(resolveTabSkeleton("config")).querySelector(".skeleton-field")).toBeTruthy();
  });

  it("uses the shared <ListSkeleton /> for the five identical list tabs", () => {
    for (const id of ["skills", "commands", "hooks", "mcp", "agents"] as const) {
      const root = renderComponent(resolveTabSkeleton(id));
      // Distinguish ListSkeleton from the other shapes by its scope-filter row
      // (only the shared list shell renders it).
      expect(root.querySelector(".skeleton-scope-row"), `wrong skeleton for "${id}"`).toBeTruthy();
    }
  });

  it("falls back to the shared list skeleton for an unknown id", () => {
    // Keeps the panel content-shaped instead of empty if a new tab is added
    // before a custom skeleton is wired up.
    const root = renderComponent(resolveTabSkeleton("not-a-real-tab"));
    expect(root.querySelector(".skeleton-scope-row")).toBeTruthy();
  });
});
