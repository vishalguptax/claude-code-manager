/**
 * Barrel for the account feature's pure helpers (no JSX, no signals).
 * Numeric/string formatting + the heatmap model builder live here so
 * they stay unit-testable in isolation and reusable across views.
 */
export {
  accountKey,
  cacheHitTooltip,
  computeUsageTotals,
  currencyFractionDigits,
  displayToolName,
  formatDuration,
  formatFetchedRelative,
  formatJoinedDate,
  formatModelName,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPct,
  formatPlan,
  formatPlanName,
  formatResetsIn,
  quotaFreshness,
  quotaTone,
  shortenProjectPath,
  type QuotaFreshness,
  type UsageTotals,
} from "./format";
export {
  buildShareCard,
  SHARE_CARD_FOOTER,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  type ShareCardModel,
} from "./shareCard";
export { renderShareCard } from "./shareCardRender";
export {
  buildHeatmap,
  cutoffDaysForPeriod,
  type BuildHeatmapOptions,
  type HeatmapCell,
  type HeatmapLevel,
  type HeatmapModel,
  type HeatmapMonthLabel,
  type HeatmapScale,
  type HeatmapState,
  type Period,
} from "./heatmap";
