// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabPanel } from "./TabPanel";

/**
 * The async `import()` calls in `featureLoaders` resolve in a follow-up
 * microtask, so the first render is always the loading state — which is
 * exactly what we want to assert here: every tab's lazy fallback paints the
 * matching content-aware skeleton from frame 1 (no generic <Loading /> flash).
 *
 * We deliberately do NOT wait for the dynamic import to settle: pulling in
 * each real feature module (with its message-bus + signal setup) would make
 * this suite a coupled integration test instead of the focused fallback check
 * it is. The feature-side render is exercised by the feature's own test file.
 */
describe("TabPanel lazy fallback", () => {
  it("renders the SessionsSkeleton while the sessions chunk is loading", () => {
    const { container } = render(h(TabPanel, { feature: "sessions" }));
    expect(container.querySelector(".skeleton-actions")).toBeTruthy();
    expect(container.querySelector(".skeleton-list-rows > .session-item")).toBeTruthy();
  });

  it("renders the AccountSkeleton while the account chunk is loading", () => {
    const { container } = render(h(TabPanel, { feature: "account" }));
    expect(container.querySelector(".skeleton-profile")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-quota-row").length).toBe(2);
  });

  it("renders the ConfigSkeleton while the config chunk is loading", () => {
    const { container } = render(h(TabPanel, { feature: "config" }));
    expect(container.querySelectorAll(".skeleton-field").length).toBe(5);
  });

  it("renders the shared ListSkeleton for the five list-shaped tabs", () => {
    for (const id of ["skills", "commands", "hooks", "mcp", "agents"] as const) {
      const { container, unmount } = render(h(TabPanel, { feature: id }));
      // .skeleton-scope-row is unique to the shared ListSkeleton shell.
      expect(container.querySelector(".skeleton-scope-row"), `wrong skeleton for "${id}"`).toBeTruthy();
      unmount();
    }
  });

  it("falls back to the shared ListSkeleton for an unknown feature id (still content-shaped, not a generic loader)", () => {
    // Unknown ids land in the error branch on the next tick, but the FIRST
    // frame still routes through the per-tab skeleton resolver — which falls
    // back to the list shape rather than a bare spinner. Tested on the very
    // first render before the unmount happens.
    const { container } = render(h(TabPanel, { feature: "not-a-real-tab" }));
    // Either the resolved skeleton shape OR the "Failed to load tab" empty
    // state (if the no-loader branch already fired) is acceptable — what we
    // forbid is a generic Loading shimmer.
    const hasSkeleton = container.querySelector(".skeleton-scope-row") !== null;
    const hasError = container.textContent?.includes("Failed to load tab") ?? false;
    expect(hasSkeleton || hasError).toBe(true);
  });
});

/**
 * Keep-alive: once a tab's chunk resolves it must stay mounted (hidden)
 * when another tab is active, so revisiting is instant. Here the feature
 * modules are stubbed with trivial components so the test stays a focused
 * shell check rather than pulling in real feature setup.
 */
vi.mock("../../../../features/account/webview/index", () => ({
  default: () => h("div", { class: "stub-account" }, "ACCOUNT"),
}));
vi.mock("../../../../features/config/webview/index", () => ({
  default: () => h("div", { class: "stub-config" }, "CONFIG"),
}));

describe("TabPanel keep-alive", () => {
  afterEach(() => vi.clearAllMocks());

  /** Wait for the pending dynamic import + state update to flush. */
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it("keeps a loaded tab mounted (hidden) after switching away, and reveals it on return", async () => {
    const { container, rerender } = render(h(TabPanel, { feature: "account" }));
    await flush();

    const account = container.querySelector(".stub-account");
    expect(account).toBeTruthy();
    // The visible account tab is not hidden.
    expect(account!.closest(".tab-keepalive")!.classList.contains("hidden")).toBe(false);

    // Switch to config.
    rerender(h(TabPanel, { feature: "config" }));
    await flush();

    // Account is STILL in the DOM — same node, just hidden. This is the
    // whole point: no unmount, so no re-request / re-parse / rebuild on
    // return.
    const accountAfter = container.querySelector(".stub-account");
    expect(accountAfter).toBe(account);
    expect(accountAfter!.closest(".tab-keepalive")!.classList.contains("hidden")).toBe(true);
    expect(container.querySelector(".stub-config")).toBeTruthy();

    // Back to account — the preserved node becomes visible again.
    rerender(h(TabPanel, { feature: "account" }));
    await flush();
    expect(container.querySelector(".stub-account")).toBe(account);
    expect(account!.closest(".tab-keepalive")!.classList.contains("hidden")).toBe(false);
  });
});
