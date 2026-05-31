/**
 * Loading skeleton for the Config tab. Mirrors the real Settings section: a
 * section-header line followed by ~5 form-field placeholders, each a short
 * label line above a full-width control-height block (the live fields are a
 * mix of <Dropdown> pickers, <TextField>s, and <Checkbox> rows, all sitting at
 * `--h-control`).
 *
 * Reuses the real `.acct-section` / `.acct-section-body` / `.acct-field` insets
 * and `--h-control` field height so the placeholder sits in the live footprint.
 * A trailing `.skeleton-fill` spacer takes the remaining flex room so the
 * panel reads as loading edge-to-edge on a tall sidebar instead of leaving
 * an empty gap below the section.
 *
 * Lives in the SHELL bundle (alongside TabPanel) so the lazy-tab fallback can
 * render this content-aware shape from frame 1 — before the Config feature
 * chunk has finished downloading. The feature's own loading branch re-imports
 * from here so there's no duplicate copy.
 */

import { SkeletonBlock, SkeletonLine } from "../../../../shared/ui";

/** Label widths per field so they don't read as a stamped column. */
const FIELD_LABELS = ["38%", "46%", "42%", "52%", "34%"];

export function ConfigSkeleton() {
  return (
    <div class="panel skeleton-panel" aria-busy="true" aria-live="polite">
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

      {/* Flex-grow filler so the skeleton fills the full panel height on a
          tall sidebar (the live Config tab grows via its scroll area; the
          skeleton has no scrolling content, so without this it leaves a
          visible gap below the section). aria-hidden because it's pure
          layout. */}
      <div class="skeleton-fill" aria-hidden="true" />
    </div>
  );
}
