/**
 * Loading skeleton for the session detail transcript. Renders inside the live
 * DetailView shell (the real Back button stays interactive above it), so it
 * only fills the body: a header block (title + meta + stat strip lines), the
 * action-button row, and a few transcript message blocks of varying width.
 *
 * Reuses the same `--space-2xl` content inset as the real `.d-head` / `.d-section`
 * so the lines land where the transcript will.
 */

import { SkeletonBlock, SkeletonLine } from "../../../../../webview/shared/ui";

/** First / second paragraph line widths per message block. */
const MESSAGE_BLOCKS: ReadonlyArray<readonly [string, string]> = [
  ["44%", "92%"],
  ["38%", "86%"],
  ["50%", "78%"],
];

export function DetailSkeleton() {
  return (
    <div class="skeleton-detail-body" aria-busy="true" aria-live="polite">
      {/* Header: title line, meta line, stat strip. */}
      <SkeletonLine width="64%" height={14} />
      <SkeletonLine width="46%" height={8} />
      <div class="skeleton-session-row1">
        <SkeletonBlock width={70} height={16} radius={8} />
        <SkeletonBlock width={70} height={16} radius={8} />
        <SkeletonBlock width={70} height={16} radius={8} />
      </div>

      {/* Action button row. */}
      <div class="skeleton-session-row1">
        <SkeletonBlock width={72} height="var(--h-control-sm)" />
        <SkeletonBlock width={64} height="var(--h-control-sm)" />
        <SkeletonBlock width={56} height="var(--h-control-sm)" />
      </div>

      {/* Transcript message blocks. */}
      {MESSAGE_BLOCKS.map(([head, body], i) => (
        <div class="skeleton-detail-block" key={i} aria-hidden="true">
          <SkeletonLine width={head} height={8} />
          <SkeletonLine width="100%" />
          <SkeletonLine width={body} />
        </div>
      ))}
    </div>
  );
}
