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
});
