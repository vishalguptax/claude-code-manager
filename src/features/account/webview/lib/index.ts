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
  formatModelName,
  formatMoney,
  formatNumber,
  formatPct,
  formatResetsIn,
  quotaTone,
  shortenProjectPath,
  type UsageTotals,
} from "./format";
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
