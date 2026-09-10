/**
 * Static Anthropic pricing snapshot used to project a cost figure on
 * top of the token counts the CLI's transcripts and stats-cache.json
 * record.
 *
 * Why a static table? The local-first promise rules out a runtime call
 * to Anthropic's billing API, and Anthropic doesn't publish a
 * machine-readable price feed. Hard-coding a snapshot is the only way
 * to surface a cost number at all. The tradeoff is that this file goes
 * stale when prices shift — bumping the rates is the only release-time
 * chore the cost feature adds.
 *
 * Rates are USD per million tokens; multiply by `tokens / 1_000_000`
 * at compute time. Pricing source:
 * https://platform.claude.com/docs/en/about-claude/pricing
 * (snapshot date in PRICES_EFFECTIVE_DATE — surfaced verbatim in the
 * Account UI so users know which date the numbers are anchored to).
 *
 * Two structural facts the table encodes, both verified against that
 * page rather than assumed:
 *
 *   - Cache WRITES are priced by TTL: 1.25× base input for the 5-minute
 *     cache, 2× for the 1-hour cache. Transcripts report the split in
 *     `usage.cache_creation`, and sessions that write everything at the
 *     1h TTL were being costed 60% light while both buckets shared one
 *     1.25× rate.
 *   - There is NO long-context surcharge. Claude 4.6 and later bill the
 *     full 1M-token window at standard rates ("a 900k-token request is
 *     billed at the same per-token rate as a 9k-token request"), so no
 *     >200k tier exists to model.
 */

export interface ModelRates {
  /** USD / million input tokens. */
  input: number;
  /** USD / million output tokens. */
  output: number;
  /** USD / million tokens read from prompt cache (a cache hit). */
  cacheRead: number;
  /** USD / million tokens written into the 5-minute prompt cache. */
  cacheWrite5m: number;
  /** USD / million tokens written into the 1-hour prompt cache. */
  cacheWrite1h: number;
}

/**
 * Date the rates below were last verified against
 * https://platform.claude.com/docs/en/about-claude/pricing. Surfaced in
 * the UI as "prices effective: <date>" so users know the snapshot's
 * age. Bump in the same commit that updates rates.
 */
export const PRICES_EFFECTIVE_DATE = "2026-09-09";

/** USD per web search issued by a server-side tool ($10 / 1,000). */
export const WEB_SEARCH_USD_PER_REQUEST = 10 / 1000;

/** Named so the unknown-model fallback can reference the same row. */
const SONNET_5_RATES: ModelRates = {
  input: 2,
  output: 10,
  cacheRead: 0.2,
  cacheWrite5m: 2.5,
  cacheWrite1h: 4,
};

/**
 * Rate rows, matched against a lowercased model id in order — most
 * specific first. Version-specific rows must precede their family row:
 * Sonnet 5 is $2/$10 while Sonnet 4.6 and 4.5 stayed at $3/$15, and
 * Fable 5.1 reads cache at 0.025× base where every other model reads at
 * 0.1×. A family-only lookup silently mispriced both.
 */
const RATE_TABLE: ReadonlyArray<{ match: RegExp; rates: ModelRates }> = [
  // Fable / Mythos 5.1 — same tier, and the only models with a 0.025×
  // cache-read multiplier.
  {
    match: /(fable|mythos)-5-1/,
    rates: { input: 10, output: 50, cacheRead: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20 },
  },
  // Fable / Mythos 5 (and the Mythos preview) — standard 0.1× reads.
  {
    match: /(fable|mythos)/,
    rates: { input: 10, output: 50, cacheRead: 1, cacheWrite5m: 12.5, cacheWrite1h: 20 },
  },
  // Retired Opus 4 / 4.1, still served on Bedrock and Google Cloud.
  // Matched by their dated ids (`claude-opus-4-20250514`,
  // `claude-opus-4-1-20250805`) so they don't fall through to the
  // current $5/$25 Opus row.
  {
    match: /opus-4-1(?!\d)|opus-4-20\d{6}/,
    rates: { input: 15, output: 75, cacheRead: 1.5, cacheWrite5m: 18.75, cacheWrite1h: 30 },
  },
  {
    match: /opus/,
    rates: { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  },
  { match: /sonnet-5/, rates: SONNET_5_RATES },
  {
    match: /sonnet/,
    rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  },
  {
    match: /haiku-3-5/,
    rates: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite5m: 1, cacheWrite1h: 1.6 },
  },
  {
    match: /haiku/,
    rates: { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  },
];

/**
 * Current Sonnet rates are the median of the lineup — used when an
 * unknown model id appears so the panel never silently shows $0 for a
 * model released after this snapshot. The user sees a number; we update
 * the table on the next release.
 */
const DEFAULT_RATES: ModelRates = SONNET_5_RATES;

/**
 * Resolve rates for a model id. Match is case-insensitive and uses
 * substring containment, so versioned and suffixed ids
 * ("claude-opus-5[1m]", "claude-sonnet-4-6") resolve without listing
 * every variant.
 */
export function ratesForModel(modelId: string): ModelRates {
  const id = (modelId || "").toLowerCase();
  for (const row of RATE_TABLE) {
    if (row.match.test(id)) return row.rates;
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
  /** Total cache-write tokens across both TTLs. */
  cacheWrite?: number;
  /**
   * Subset of `cacheWrite` written at the 1-hour TTL (2× base input).
   * The remainder is priced at the 5-minute rate (1.25×). Absent for
   * sources that don't report the split — Claude's own stats-cache has
   * only a combined figure — in which case everything is priced at the
   * 5-minute rate, matching the previous behaviour.
   */
  cacheWrite1h?: number;
  /** Server-side web searches, billed per request on top of tokens. */
  webSearchRequests?: number;
}

/**
 * Compute USD cost for a model's token totals. Returns 0 for empty
 * inputs (no tokens = no cost) so the caller can sum results without a
 * guard.
 *
 * Web fetch is deliberately absent: it carries no per-request charge,
 * only the tokens of whatever it pulled in, which are already counted.
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
  // Clamp: a malformed transcript could report a 1h subset larger than
  // the total, which would otherwise make the 5m remainder negative.
  const write1h = Math.min(Math.max(buckets.cacheWrite1h ?? 0, 0), cacheWrite);
  const write5m = cacheWrite - write1h;
  const searches = buckets.webSearchRequests ?? 0;
  return (
    (input * rates.input +
      output * rates.output +
      cacheRead * rates.cacheRead +
      write5m * rates.cacheWrite5m +
      write1h * rates.cacheWrite1h) /
      million +
    searches * WEB_SEARCH_USD_PER_REQUEST
  );
}

/**
 * Numeric recency score for a Claude model id. Higher = newer.
 * `claude-opus-4-7-…` → 4*100 + 7 = 407. Unknown / non-Claude models
 * score -1 so they sort to the bottom.
 */
export function modelRecency(modelId: string): number {
  // Family is any word (fable, opus, ...), not a hardcoded list, so a
  // new family sorts by version immediately instead of scoring -1 and
  // sinking to the bottom of the breakdown.
  const m = modelId.match(/claude-[a-z]{3,12}-(\d+)-?(\d*)/i);
  if (!m) return -1;
  const major = parseInt(m[1], 10);
  const minor = m[2] ? parseInt(m[2], 10) : 0;
  return major * 100 + minor;
}

/**
 * Sort comparator for per-model breakdowns: newest models first
 * (descending recency). Ties broken by higher totalTokens so within a
 * single model version the bigger spender still comes first.
 */
export function compareModelRecencyDesc(
  a: { model: string; totalTokens: number },
  b: { model: string; totalTokens: number },
): number {
  const r = modelRecency(b.model) - modelRecency(a.model);
  return r !== 0 ? r : b.totalTokens - a.totalTokens;
}
