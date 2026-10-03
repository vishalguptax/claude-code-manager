/**
 * Loading skeleton for the Config tab, in the tab's own shape: the two
 * sections that open expanded (Model & reasoning, Permissions), each a header
 * line over its fields, then the header lines of the six sections that open
 * folded. A field is a short label line over a control-height block; a toggle
 * is one short line, as the live checkbox rows are.
 *
 * Reuses the real `.section` / `.section-header` / `.section-body` insets and
 * `--h-control` so every placeholder sits in the live footprint and nothing
 * jumps when the data lands. A trailing `.skeleton-fill` spacer takes the
 * remaining flex room so a tall sidebar reads as loading edge-to-edge.
 *
 * Lives in the SHELL bundle (alongside TabPanel) so the lazy-tab fallback can
 * render this content-aware shape from frame 1, before the Config feature
 * chunk has finished downloading. The feature's own loading branch re-imports
 * from here so there's no duplicate copy.
 */

import { SkeletonBlock, SkeletonLine } from "../../../../shared/ui";

/** One open section: its header width, then each row as a field or a toggle. */
const OPEN_SECTIONS: ReadonlyArray<{ header: number; rows: ReadonlyArray<"field" | "toggle"> }> = [
  { header: 120, rows: ["field", "field", "toggle"] },
  { header: 88, rows: ["field", "toggle", "toggle"] },
];

/** Header widths for the folded sections, varied so they read as real titles. */
const FOLDED_HEADERS = [118, 104, 70, 92, 112, 96];

/** Label widths so stacked fields don't read as a stamped column. */
const LABEL_WIDTHS = ["38%", "46%", "42%", "52%"];

export function ConfigSkeleton() {
  let label = 0;
  return (
    <div class="panel skeleton-panel" aria-busy="true" aria-live="polite">
      {OPEN_SECTIONS.map((section, s) => (
        <section class="section" key={`open-${s}`}>
          <div class="section-header">
            <SkeletonLine width={section.header} height={9} />
          </div>
          <div class="section-body">
            {section.rows.map((row, r) =>
              row === "field" ? (
                <div class="skeleton-field" key={r} aria-hidden="true">
                  <SkeletonLine width={LABEL_WIDTHS[label++ % LABEL_WIDTHS.length]} height={8} />
                  <SkeletonBlock height="var(--h-control)" />
                </div>
              ) : (
                <div class="skeleton-toggle" key={r} aria-hidden="true">
                  <SkeletonLine width="58%" height={9} />
                </div>
              ),
            )}
          </div>
        </section>
      ))}
      {FOLDED_HEADERS.map((width, i) => (
        <section class="section" key={`folded-${i}`}>
          <div class="section-header">
            <SkeletonLine width={width} height={9} />
          </div>
        </section>
      ))}

      {/* Flex-grow filler so the skeleton fills the full panel height on a
          tall sidebar (the live Config tab grows via its scroll area; the
          skeleton has no scrolling content, so without this it leaves a
          visible gap below the sections). aria-hidden because it's pure
          layout. */}
      <div class="skeleton-fill" aria-hidden="true" />
    </div>
  );
}
