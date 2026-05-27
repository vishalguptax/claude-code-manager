/**
 * Pure transforms for the statusline tap — no IO, no vscode, no Node
 * built-ins beyond plain data. Shared by the standalone tap script
 * (which bundles this) and the host-side reader/tests.
 *
 * Claude Code hands its configured `statusLine.command` a JSON payload
 * on stdin every render. That payload is the ONLY place the Pro/Max
 * 5h/7d rate-limit utilization is exposed locally — it is server-
 * computed and cannot be derived from local files. Tapping it lets
 * Claude Manager show quota without any network call: Claude Code (the
 * authorized client) does the fetch, we read the cached result.
 *
 * `extractCache` is deliberately defensive: the payload shape is owned
 * by Claude Code and may gain/lose fields across releases, so every
 * field is optional and absent data maps to null rather than throwing.
 */

/** Normalised subset of the statusline payload we persist + render. */
export interface StatuslineCache {
  /** Epoch ms when the tap captured this (NOT from the payload). */
  capturedAt: number;
  /** Claude Code version string, e.g. "2.1.86". Empty when absent. */
  version: string;
  /** Active model, or null when the payload omitted it. */
  model: { id: string; displayName: string } | null;
  /** Context-window usage for the current session, or null. */
  context: { usedPercent: number; size: number } | null;
  /** Current-session cost + edit counters, or null. */
  cost: {
    totalUsd: number;
    durationMs: number;
    linesAdded: number;
    linesRemoved: number;
  } | null;
  /** Rolling rate-limit windows. Either side is null when absent. */
  rateLimits: {
    fiveHour: RateWindow | null;
    sevenDay: RateWindow | null;
  };
}

/** A single rolling rate-limit window. */
export interface RateWindow {
  /** Percentage 0–100 of the window's cap consumed. */
  usedPercent: number;
  /** Epoch SECONDS when the window resets, or 0 when unknown. */
  resetsAt: number;
}

// ── Payload shape (all optional — owned by Claude Code) ──

interface StatuslinePayload {
  version?: unknown;
  model?: { id?: unknown; display_name?: unknown } | null;
  context_window?: {
    used_percentage?: unknown;
    context_window_size?: unknown;
  } | null;
  cost?: {
    total_cost_usd?: unknown;
    total_duration_ms?: unknown;
    total_lines_added?: unknown;
    total_lines_removed?: unknown;
  } | null;
  rate_limits?: {
    five_hour?: RatePayload | null;
    seven_day?: RatePayload | null;
  } | null;
}

interface RatePayload {
  used_percentage?: unknown;
  resets_at?: unknown;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function window(raw: RatePayload | null | undefined): RateWindow | null {
  if (!raw || typeof raw.used_percentage !== "number") return null;
  return { usedPercent: num(raw.used_percentage), resetsAt: num(raw.resets_at) };
}

/**
 * Parse a raw statusline payload string into a `StatuslineCache`.
 * Returns null only when the input isn't valid JSON — a valid payload
 * missing every field still yields a cache (with nulls) so the caller
 * can record "Claude ran but reported nothing yet".
 *
 * `now` is injected (not read from a clock) so this stays pure and the
 * captured timestamp is testable.
 */
export function extractCache(raw: string, now: number): StatuslineCache | null {
  let payload: StatuslinePayload;
  try {
    payload = JSON.parse(raw) as StatuslinePayload;
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const model = payload.model;
  const ctx = payload.context_window;
  const cost = payload.cost;
  const rl = payload.rate_limits;

  return {
    capturedAt: now,
    version: str(payload.version),
    model:
      model && (model.id != null || model.display_name != null)
        ? { id: str(model.id), displayName: str(model.display_name) }
        : null,
    context:
      ctx && typeof ctx.used_percentage === "number"
        ? {
            usedPercent: num(ctx.used_percentage),
            size: num(ctx.context_window_size),
          }
        : null,
    cost:
      cost && typeof cost.total_cost_usd === "number"
        ? {
            totalUsd: num(cost.total_cost_usd),
            durationMs: num(cost.total_duration_ms),
            linesAdded: num(cost.total_lines_added),
            linesRemoved: num(cost.total_lines_removed),
          }
        : null,
    rateLimits: {
      fiveHour: window(rl?.five_hour),
      sevenDay: window(rl?.seven_day),
    },
  };
}

/**
 * Compact one-line status rendered by the tap when the user has NO
 * existing statusline to chain — so installing the tap leaves them with
 * a useful bar rather than a blank one. Shows whatever the payload
 * provided; omits any segment whose data is missing.
 */
export function renderDefaultLine(cache: StatuslineCache): string {
  const parts: string[] = [];
  if (cache.model && cache.model.displayName) parts.push(cache.model.displayName);
  if (cache.context) parts.push(`ctx ${Math.round(cache.context.usedPercent)}%`);
  const r = cache.rateLimits;
  if (r.fiveHour) parts.push(`5h ${Math.round(r.fiveHour.usedPercent)}%`);
  if (r.sevenDay) parts.push(`7d ${Math.round(r.sevenDay.usedPercent)}%`);
  return parts.join("  ·  ");
}
