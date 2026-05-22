// @vitest-environment happy-dom
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import type { QuotaWindow } from "../../quota";
import type { DailyActivity, DailyTokens } from "../../types";
import { SectionHeader } from "../components/SectionHeader";
import { QuotaBar } from "../components/QuotaBar";
import { StatTile } from "../components/StatTile";
import { MetaRow } from "../components/MetaRow";
import { Heatmap } from "../components/Heatmap";

describe("SectionHeader", () => {
  it("renders the title and reflects expanded state", () => {
    render(h(SectionHeader, { id: "usage", title: "Usage", collapsed: false, onToggle: () => {} }));
    const header = screen.getByText("Usage").closest(".acct-section-header") as HTMLElement;
    expect(header.getAttribute("aria-expanded")).toBe("true");
  });

  it("calls onToggle on click and on Enter", () => {
    const onToggle = vi.fn();
    render(h(SectionHeader, { id: "quota", title: "Quota", collapsed: true, onToggle }));
    const header = screen.getByText("Quota").closest(".acct-section-header") as HTMLElement;
    fireEvent.click(header);
    fireEvent.keyDown(header, { key: "Enter" });
    fireEvent.keyDown(header, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(3);
    expect(onToggle).toHaveBeenCalledWith("quota");
  });

  it("renders header children (e.g. refresh button)", () => {
    render(
      h(
        SectionHeader,
        { id: "quota", title: "Quota", collapsed: false, onToggle: () => {} },
        h("button", { type: "button" }, "Refresh"),
      ),
    );
    expect(screen.getByText("Refresh")).toBeTruthy();
  });
});

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

describe("StatTile", () => {
  it("renders value and label, with an optional tooltip", () => {
    render(h(StatTile, { value: "12.0K", label: "tokens", title: "hint" }));
    expect(screen.getByText("12.0K")).toBeTruthy();
    const tile = screen.getByText("tokens").closest(".acct-stat") as HTMLElement;
    expect(tile.getAttribute("title")).toBe("hint");
  });
});

describe("MetaRow", () => {
  it("renders a key/value pair", () => {
    render(h(MetaRow, { k: "Active days", v: "3 / 30" }));
    expect(screen.getByText("Active days")).toBeTruthy();
    expect(screen.getByText("3 / 30")).toBeTruthy();
  });

  it("applies the total modifier", () => {
    render(h(MetaRow, { k: "Total", v: "$5", total: true }));
    const row = screen.getByText("Total").closest(".acct-meta-row") as HTMLElement;
    expect(row.classList.contains("acct-meta-row-total")).toBe(true);
  });
});

describe("Heatmap", () => {
  const daily: DailyActivity[] = [
    { date: "2026-05-20", messageCount: 5, sessionCount: 2, toolCallCount: 7 },
  ];
  const dailyTokens: DailyTokens[] = [{ date: "2026-05-20", total: 9000 }];

  it("renders day labels and a grid of cells", () => {
    const { container } = render(
      h(Heatmap, { daily, dailyTokens, lastComputedDate: "2026-05-20" }),
    );
    expect(screen.getByText("Mon")).toBeTruthy();
    const cells = container.querySelectorAll(".acct-heat-cell");
    // 52-week grid → at least a full year of cells.
    expect(cells.length).toBeGreaterThan(300);
  });
});
