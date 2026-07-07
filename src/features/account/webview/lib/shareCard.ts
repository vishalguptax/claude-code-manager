/**
 * Pure model builder for the shareable "My Claude Code year" stats card.
 *
 * Takes the already-loaded `UsageStats` and resolves it into a plain data
 * object describing EXACTLY what the canvas renderer must draw — the title
 * strings, the resolved headline / streak / fav text, and a fully-built
 * heatmap model (52-week window, same intensity levels the on-screen
 * `Heatmap` uses). No canvas, no DOM, no Preact — so it unit-tests directly.
 *
 * The renderer (`shareCardRender.ts`) owns all drawing concerns (fixed dark
 * palette, fonts, coordinates); this file owns only the content decisions.
 */

import type { UsageStats } from "../../types";
import { formatModelName, formatNumber } from "./format";
import { buildHeatmap, type HeatmapModel } from "./heatmap";

/** Fixed pixel dimensions — OG ratio (1200×630), good for social preview. */
export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

/** Days in the rolling heatmap window (52 weeks = 364 days). */
const HEATMAP_WINDOW_DAYS = 364;

/** Public site footer stamped on every card. */
export const SHARE_CARD_FOOTER = "claudecodemanager.vishalg.in";

/**
 * Fully-resolved description of the card. Every string is final — the
 * renderer never re-formats. `subline` is null when neither the streak
 * nor the favorite-model segment applies (both omitted), so the renderer
 * can skip the line entirely.
 */
export interface ShareCardModel {
  width: number;
  height: number;
  /** "My Claude Code year" */
  title: string;
  /** "{sessions} sessions · {tokens} tokens" — all-time totals. */
  headline: string;
  /** "🔥 {n}-day streak · fav: {Model}", partial, or null. */
  subline: string | null;
  /** Site footer text. */
  footer: string;
  /** GitHub-style 52-week activity grid, same model the on-screen heatmap uses. */
  heatmap: HeatmapModel;
}

/**
 * Build the card model from usage stats. `today` is injectable so the
 * heatmap window is deterministic in tests; callers normally omit it.
 */
export function buildShareCard(u: UsageStats, today: Date = new Date()): ShareCardModel {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - HEATMAP_WINDOW_DAYS);
  const startDate = toIsoDate(start);

  const heatmap = buildHeatmap(today, u.daily, u.dailyTokens, {
    startDate,
    lastComputedDate: u.lastComputedDate,
  });

  const headline = `${formatNumber(u.totalSessions)} sessions · ${formatNumber(u.totalTokens)} tokens`;

  return {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    title: "My Claude Code year",
    headline,
    subline: buildSubline(u),
    footer: SHARE_CARD_FOOTER,
    heatmap,
  };
}

/**
 * Second line: "🔥 {n}-day streak · fav: {Model}". Omit the streak
 * segment when currentStreak is 0; omit the fav segment when there is
 * no favoriteModel. Returns null when both are omitted.
 */
function buildSubline(u: UsageStats): string | null {
  const segments: string[] = [];
  if (u.currentStreak > 0) segments.push(`🔥 ${u.currentStreak}-day streak`);
  if (u.favoriteModel) segments.push(`fav: ${formatModelName(u.favoriteModel)}`);
  return segments.length > 0 ? segments.join(" · ") : null;
}

/** YYYY-MM-DD in local time — matches the keys buildHeatmap expects. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
