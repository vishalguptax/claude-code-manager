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
 * avatar size so the placeholder sits in the live section footprint.
 */

import { SkeletonBlock, SkeletonCircle, SkeletonLine } from "../../../../../webview/shared/ui";

function SectionHeaderLine() {
  return (
    <div class="acct-section-header">
      <SkeletonLine width={96} height={9} />
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div class="panel" aria-busy="true" aria-live="polite">
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
    </div>
  );
}
