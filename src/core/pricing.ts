/**
 * Static Anthropic pricing snapshot used to project a cost figure on
 * top of the token counts the CLI's stats-cache.json already records.
 *
 * Why a static table? The local-first promise rules out a runtime
 * call to Anthropic's billing API, and Anthropic doesn't publish a
 * machine-readable price feed. Hard-coding a snapshot is the only
 * way to surface a cost number at all. The tradeoff is that this
 * file goes stale when prices shift — bumping the rates is the only
 * release-time chore the cost feature adds.
 *
 * Rates are USD per million tokens; multiply by `tokens / 1_000_000`
 * at compute time. Pricing source: https://www.anthropic.com/pricing
 * (snapshot date in PRICES_EFFECTIVE_DATE — surfaced verbatim in the
 * Account UI so users know which date the numbers are anchored to).
 */

export interface ModelRates {
  /** USD / million input tokens. */
  input: number;
  /** USD / million output tokens. */
  output: number;
  /** USD / million tokens read from prompt cache. ~10% of input price. */
  cacheRead: number;
  /** USD / million tokens written into prompt cache. ~1.25× input price. */
  cacheWrite: number;
}

/**
 * Date the rates below were last verified against
 * https://www.anthropic.com/pricing. Surfaced in the UI as "prices
 * effective: <date>" so users know the snapshot's age. Bump in the
 * same commit that updates rates.
 */
export const PRICES_EFFECTIVE_DATE = "2026-04-26";

/**
 * Family-level rates. Each model ID resolves to one of these by
 * matching the family token in its name ("opus", "sonnet", "haiku").
 * Unknown IDs fall through to `DEFAULT_RATES` so a brand-new model
 * still produces a reasonable cost approximation between releases.
 */
const FAMILY_RATES: Record<string, ModelRates> = {
  opus:    { input: 15, output: 75, cacheRead: 1.5,  cacheWrite: 18.75 },
  sonnet:  { input: 3,  output: 15, cacheRead: 0.3,  cacheWrite: 3.75 },
  haiku:   { input: 1,  output: 5,  cacheRead: 0.1,  cacheWrite: 1.25 },
};

/**
 * Sonnet rates are the median of the lineup — used when an unknown
 * model ID appears so the panel never silently shows $0 for fresh
 * IDs. The user sees a number; we update the table on the next
 * release.
 */
const DEFAULT_RATES: ModelRates = FAMILY_RATES.sonnet;

/**
 * Resolve rates for a model ID. Match is case-insensitive and uses
 * substring containment so versioned IDs ("claude-opus-4-7-2026…",
 * "claude-sonnet-4-6") map to the right family without listing
 * every dated variant.
 */
export function ratesForModel(modelId: string): ModelRates {
  const id = (modelId || "").toLowerCase();
  for (const family of Object.keys(FAMILY_RATES)) {
    if (id.includes(family)) return FAMILY_RATES[family];
  }
  return DEFAULT_RATES;
}

/**
 * Per-token-bucket counts for a single model over some period. All
 * fields default to 0 so callers can pass a partial shape from cache
 * lookups without guarding each field.
 */
export interface ModelTokenBuckets {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * Compute USD cost for a model's token totals. Returns 0 for empty
 * inputs (no tokens = no cost) so the caller can sum results without
 * a guard. Math is intentionally trivial — a single multiply/add
 * pass keeps the function side-effect-free and easy to test.
 */
export function computeModelCost(
  modelId: string,
  buckets: ModelTokenBuckets,
): number {
  const rates = ratesForModel(modelId);
  const million = 1_000_000;
  const input = buckets.input ?? 0;
  const output = buckets.output ?? 0;
  const cacheRead = buckets.cacheRead ?? 0;
  const cacheWrite = buckets.cacheWrite ?? 0;
  return (
    (input * rates.input +
      output * rates.output +
      cacheRead * rates.cacheRead +
      cacheWrite * rates.cacheWrite) /
    million
  );
}
