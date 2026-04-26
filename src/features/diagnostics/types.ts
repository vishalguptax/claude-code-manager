/** Outcome of a single diagnostic check. */
export type DiagnosticStatus = "pass" | "warn" | "fail";

/**
 * One row in the diagnostics report. `id` is stable so the UI / tests
 * can find a specific row without depending on display order.
 * `fixHint` is only set when there's a concrete next step the user
 * can take — leaves the report uncluttered when nothing's wrong.
 */
export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
  fixHint?: string;
}
