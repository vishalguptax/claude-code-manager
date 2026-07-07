import { describe, expect, it, vi } from "vitest";
import type { ShareCardModel } from "../lib/shareCard";
import { renderShareCard } from "../lib/shareCardRender";
import type { HeatmapCell, HeatmapModel } from "../lib/heatmap";

/**
 * Minimal mock of the bits of CanvasRenderingContext2D the renderer uses.
 * happy-dom's canvas is a no-op, so we assert against a hand-rolled spy
 * object rather than real pixels — enough to prove the renderer draws the
 * title, footer, and one rect per heatmap cell.
 */
function makeCtx() {
  return {
    fillStyle: "",
    font: "",
    textAlign: "" as CanvasTextAlign,
    textBaseline: "" as CanvasTextBaseline,
    fillRect: vi.fn(),
    fillText: vi.fn(),
  };
}

function cell(over: Partial<HeatmapCell> = {}): HeatmapCell {
  return {
    date: "2026-07-07",
    col: 0,
    row: 0,
    level: 3,
    state: "past",
    tokens: 100,
    messages: 2,
    sessions: 1,
    ...over,
  };
}

function makeHeatmap(cells: HeatmapCell[]): HeatmapModel {
  return {
    weeks: 1,
    cells,
    monthLabels: [],
    max: 100,
    scale: "tokens",
    rangeStart: "2026-07-01",
    rangeEnd: "2026-07-07",
  };
}

function makeModel(over: Partial<ShareCardModel> = {}): ShareCardModel {
  return {
    width: 1200,
    height: 630,
    title: "My Claude Code year",
    headline: "1.2K sessions · 1.4M tokens",
    subline: "🔥 3-day streak · fav: Sonnet 4.5",
    footer: "claudecodemanager.vishalg.in",
    heatmap: makeHeatmap([cell({ col: 0, row: 0 }), cell({ col: 0, row: 1, level: 1 })]),
    ...over,
  };
}

describe("renderShareCard", () => {
  it("fills the background across the full card", () => {
    const ctx = makeCtx();
    renderShareCard(ctx as unknown as CanvasRenderingContext2D, makeModel());
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1200, 630);
  });

  it("draws the title, headline, subline, and footer text", () => {
    const ctx = makeCtx();
    const model = makeModel();
    renderShareCard(ctx as unknown as CanvasRenderingContext2D, model);
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toContain(model.title);
    expect(texts).toContain(model.headline);
    expect(texts).toContain(model.subline);
    expect(texts).toContain(model.footer);
  });

  it("skips the subline text when it is null", () => {
    const ctx = makeCtx();
    renderShareCard(ctx as unknown as CanvasRenderingContext2D, makeModel({ subline: null }));
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toContain("My Claude Code year");
    expect(texts).not.toContain("🔥 3-day streak · fav: Sonnet 4.5");
  });

  it("draws one rect per heatmap cell plus the background rect", () => {
    const ctx = makeCtx();
    const model = makeModel();
    renderShareCard(ctx as unknown as CanvasRenderingContext2D, model);
    // 1 background + 2 cells.
    expect(ctx.fillRect).toHaveBeenCalledTimes(1 + model.heatmap.cells.length);
  });
});
