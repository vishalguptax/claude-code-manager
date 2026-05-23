// @vitest-environment happy-dom
import { render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it } from "vitest";
import type { DailyActivity, DailyTokens } from "../../../types";
import { Heatmap } from "./Heatmap";

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
