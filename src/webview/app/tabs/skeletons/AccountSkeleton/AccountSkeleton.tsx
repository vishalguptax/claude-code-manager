/**
 * Loading skeleton for the Account tab. Mirrors the real Profile / Quota /
 * Usage section stack so the swap to data has no layout shift:
 *   - Profile: a circular avatar + name/email lines + a small plan-badge block.
 *   - Quota: a section-header line, then two windows — each two label lines
 *     above a full-width bar block.
 *   - Usage: a section-header line + a single rect placeholder for the heatmap
 *     area (the heatmap grid itself is not skeletoned — a calendar of cells
 *     would be noisier than the content it stands in for).
 *
 * Reuses the real `.acct-section` / `.acct-section-body` insets and the 40px
 * avatar size so the placeholder sits in the live section footprint. A
 * trailing `.skeleton-fill` spacer takes the remaining flex room so the panel
 * reads as loading edge-to-edge on a tall sidebar instead of leaving an
 * empty gap below the last section.
 *
 * Lives in the SHELL bundle (alongside TabPanel) so the lazy-tab fallback can
 * render this content-aware shape from frame 1 — before the Account feature
 * chunk has finished downloading. The feature's own loading branch re-imports
 * from here so there's no duplicate copy.
 */

import { SkeletonBlock, SkeletonCircle, SkeletonLine } from "../../../../shared/ui";

function SectionHeaderLine() {
  return (
    <div class="acct-section-header">
      <SkeletonLine width={96} height={9} />
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div class="panel skeleton-panel" aria-busy="true" aria-live="polite">
      {/* Profile */}
      <section class="acct-section">
        <SectionHeaderLine />
        <div class="acct-section-body">
          <div class="skeleton-profile">
            <SkeletonCircle size={40} />
            <div class="skeleton-profile-info">
              <SkeletonLine width="50%" height={11} />
              <SkeletonLine width="70%" height={8} />
            </div>
            <SkeletonBlock width={48} height={18} radius={9} />
          </div>
        </div>
      </section>

      {/* Quota */}
      <section class="acct-section">
        <SectionHeaderLine />
        <div class="acct-section-body">
          {[0, 1].map((i) => (
            <div class="skeleton-quota-row" key={i} aria-hidden="true">
              <div class="skeleton-quota-head">
                <SkeletonLine width="40%" height={9} />
                <SkeletonLine width={32} height={9} />
              </div>
              <SkeletonBlock height={8} radius={4} />
            </div>
          ))}
        </div>
      </section>

      {/* Usage — single rect placeholder for the heatmap area. */}
      <section class="acct-section">
        <SectionHeaderLine />
        <div class="acct-section-body">
          <SkeletonBlock height={120} radius={4} />
        </div>
      </section>

      {/* Flex-grow filler so the skeleton fills the full panel height on a
          tall sidebar (the live Account tab grows via its scroll area; the
          skeleton has no scrolling content, so without this it leaves a
          visible gap below the last section). aria-hidden because it's
          pure layout — nothing for AT to announce. */}
      <div class="skeleton-fill" aria-hidden="true" />
    </div>
  );
}
