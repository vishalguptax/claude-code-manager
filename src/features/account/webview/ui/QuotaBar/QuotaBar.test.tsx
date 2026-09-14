// @vitest-environment happy-dom
import { render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it } from "vitest";
import type { QuotaWindow } from "../../../quota";
import { QuotaBar } from "./QuotaBar";

describe("QuotaBar", () => {
  it("clamps and rounds the percentage and exposes aria attrs", () => {
    const win: QuotaWindow = { utilization: 142.6, resetsAt: "" };
    render(h(QuotaBar, { label: "5-hour window", window: win }));
    expect(screen.getByText("100%")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
  });

  it("shows a reset timer when resetsAt is set", () => {
    const future = new Date(Date.now() + 2 * 3600000).toISOString();
    render(h(QuotaBar, { label: "7-day window", window: { utilization: 30, resetsAt: future } }));
    expect(screen.getByText(/resets in/)).toBeTruthy();
  });

  it("draws the projection on the bar and counts down beside the reset", () => {
    const future = new Date(Date.now() + 2 * 3600000).toISOString();
    const { container } = render(
      h(QuotaBar, {
        label: "7-day window",
        window: { utilization: 80, resetsAt: future },
        pace: {
          verdict: "ahead",
          elapsedPercent: 50,
          projectedPercent: 160,
          exhaustsAt: new Date(Date.now() + 21 * 3600_000).toISOString(),
          shortfallMs: 2 * 86400_000,
        },
      }),
    );
    // Ghost reaches the end of the track: overshoot has nowhere to go.
    const ghost = container.querySelector(".acct-quota-bar-ghost") as HTMLElement;
    expect(ghost.style.width).toBe("100%");
    expect(ghost.className).toContain("pace-ahead");
    // Countdown sits on the reset line, not on a line of its own.
    const sub = container.querySelector(".acct-quota-sub") as HTMLElement;
    expect(sub.textContent).toContain("resets in");
    expect(sub.querySelector(".acct-quota-countdown")?.textContent).toMatch(/^out in \d+h$/);
    // The projection the bar spares the reader stays in the tooltip.
    expect(screen.getByRole("progressbar").getAttribute("title")).toContain("160%");
  });

  it("shows the ghost but no countdown when the week is on track", () => {
    const future = new Date(Date.now() + 2 * 3600000).toISOString();
    const { container } = render(
      h(QuotaBar, {
        label: "7-day window",
        window: { utilization: 20, resetsAt: future },
        pace: {
          verdict: "under",
          elapsedPercent: 50,
          projectedPercent: 40,
          exhaustsAt: "",
          shortfallMs: null,
        },
      }),
    );
    expect((container.querySelector(".acct-quota-bar-ghost") as HTMLElement).style.width).toBe(
      "40%",
    );
    expect(container.querySelector(".acct-quota-countdown")).toBeNull();
  });

  it("draws no projection at all when none could be computed", () => {
    const future = new Date(Date.now() + 2 * 3600000).toISOString();
    const { container } = render(
      h(QuotaBar, {
        label: "7-day window",
        window: { utilization: 30, resetsAt: future },
        pace: null,
      }),
    );
    expect(container.querySelector(".acct-quota-bar-ghost")).toBeNull();
    expect(container.querySelector(".acct-quota-countdown")).toBeNull();
  });
});
