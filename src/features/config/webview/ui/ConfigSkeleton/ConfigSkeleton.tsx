/**
 * Loading skeleton for the Config tab. Mirrors the real Settings section: a
 * section-header line followed by ~5 form-field placeholders, each a short
 * label line above a full-width control-height block (the live fields are a
 * mix of <Dropdown> pickers, <TextField>s, and <Checkbox> rows, all sitting at
 * `--h-control`).
 *
 * Reuses the real `.acct-section` / `.acct-section-body` / `.acct-field` insets
 * and `--h-control` field height so the placeholder sits in the live footprint.
 */

import { SkeletonBlock, SkeletonLine } from "../../../../../webview/shared/ui";

/** Label widths per field so they don't read as a stamped column. */
const FIELD_LABELS = ["38%", "46%", "42%", "52%", "34%"];

export function ConfigSkeleton() {
  return (
    <div class="panel" aria-busy="true" aria-live="polite">
      <section class="acct-section">
        <div class="acct-section-header">
          <SkeletonLine width={88} height={9} />
        </div>
        <div class="acct-section-body">
          {FIELD_LABELS.map((w, i) => (
            <div class="skeleton-field" key={i} aria-hidden="true">
              <SkeletonLine width={w} height={8} />
              <SkeletonBlock height="var(--h-control)" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
