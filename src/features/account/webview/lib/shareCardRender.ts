/**
 * Canvas renderer for the share card. Takes a fully-resolved
 * `ShareCardModel` (from `shareCard.ts`) plus a `CanvasRenderingContext2D`
 * and draws the card — nothing else. Canvas / DOM creation stays in the UI
 * trigger so this stays a pure "model + ctx → pixels" function testable
 * against a mocked 2d context.
 *
 * The palette is fixed and theme-INDEPENDENT: a shared image must look
 * identical regardless of the viewer's VS Code theme, so we never read
 * `--vscode-*` vars here. Colours track the marketing site — near-black
 * stone background, GitHub-style green heatmap scale.
 */

import type { HeatmapLevel, HeatmapModel } from "./heatmap";
import type { ShareCardModel } from "./shareCard";

/** Fixed dark palette. Stone background + green heatmap scale (site brand). */
const PALETTE = {
  bg: "#0c0a09",
  title: "#fafaf9",
  headline: "#e7e5e4",
  subline: "#a8a29e",
  footer: "#78716c",
  /** Empty-cell fill (level 0) — a hair above the background. */
  cellEmpty: "#1c1917",
  /** Green intensity ramp for levels 1..4 (GitHub-contribution greens). */
  cellLevels: ["#1c1917", "#0e4429", "#006d32", "#26a641", "#39d353"] as const,
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Layout constants — all derived once so the block reads as a spec. */
const TITLE_Y = 120;
const CELL = 15;
const CELL_GAP = 4;
const CELL_STEP = CELL + CELL_GAP;

function levelColor(level: HeatmapLevel): string {
  return PALETTE.cellLevels[level] ?? PALETTE.cellEmpty;
}

/**
 * Draw the heatmap grid centred horizontally, returning the y-coordinate
 * just below the grid so the text block can flow beneath it.
 */
function drawHeatmap(ctx: CanvasRenderingContext2D, heatmap: HeatmapModel, cardWidth: number): number {
  const gridWidth = heatmap.weeks * CELL_STEP - CELL_GAP;
  const gridHeight = 7 * CELL_STEP - CELL_GAP;
  const originX = Math.round((cardWidth - gridWidth) / 2);
  const originY = 190;

  for (const cell of heatmap.cells) {
    ctx.fillStyle = levelColor(cell.level);
    ctx.fillRect(
      originX + cell.col * CELL_STEP,
      originY + cell.row * CELL_STEP,
      CELL,
      CELL,
    );
  }
  return originY + gridHeight;
}

/**
 * Render the whole card. Fills the background, draws the title, the
 * 52-week heatmap hero, the headline / streak lines, and the footer.
 */
export function renderShareCard(ctx: CanvasRenderingContext2D, model: ShareCardModel): void {
  // Background.
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, model.width, model.height);

  // Title.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PALETTE.title;
  ctx.font = `700 56px ${FONT_STACK}`;
  ctx.fillText(model.title, model.width / 2, TITLE_Y);

  // Heatmap hero.
  drawHeatmap(ctx, model.heatmap, model.width);

  // Text block below the grid. Fixed baselines keep the composition stable
  // whether or not the optional subline is present.
  ctx.fillStyle = PALETTE.headline;
  ctx.font = `600 40px ${FONT_STACK}`;
  ctx.fillText(model.headline, model.width / 2, 440);

  if (model.subline) {
    ctx.fillStyle = PALETTE.subline;
    ctx.font = `400 30px ${FONT_STACK}`;
    ctx.fillText(model.subline, model.width / 2, 500);
  }

  ctx.fillStyle = PALETTE.footer;
  ctx.font = `500 26px ${FONT_STACK}`;
  ctx.fillText(model.footer, model.width / 2, model.height - 44);
}
