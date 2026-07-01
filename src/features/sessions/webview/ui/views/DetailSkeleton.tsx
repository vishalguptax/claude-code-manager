/**
 * Loading skeleton for the session detail view. Mirrors the real DetailView
 * structure block-for-block so the transition to loaded content is seamless
 * (no layout jump): the `.d-head` header (title, subtitle, meta pills, stat
 * strip), the `.d-actions` button row, the messages section header (label +
 * search), and a few transcript message cards with the same left-accent-bar
 * shape as `.d-msg`. Insets match the real `--space-2xl` content inset.
 *
 * Renders inside the live DetailView shell (the real Back button stays
 * interactive above it), so it only fills the body.
 */

import { SkeletonBlock, SkeletonLine } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";

/**
 * Transcript placeholder rows: role + content-line widths, alternating
 * user/assistant so the stack reads like a real conversation (short user
 * prompts, longer assistant replies).
 */
const MESSAGE_BLOCKS: ReadonlyArray<{ role: "user" | "assistant"; lines: readonly string[] }> = [
  { role: "user", lines: ["68%"] },
  { role: "assistant", lines: ["100%", "96%", "58%"] },
  { role: "user", lines: ["44%"] },
  { role: "assistant", lines: ["100%", "82%"] },
];

/** Number of value+label pairs in the stat strip placeholder. */
const STAT_COUNT = 4;

export function DetailSkeleton() {
  return (
    <div class="skeleton-detail" aria-busy="true" aria-live="polite">
      {/* Header — mirrors .d-head (title, subtitle, meta pills, stat strip). */}
      <div class="skeleton-d-head">
        <SkeletonLine width="58%" height={15} />
        <SkeletonLine width="40%" height={9} />
        <div class="skeleton-d-meta">
          <SkeletonBlock width={66} height={16} radius={999} />
          <SkeletonBlock width={50} height={16} radius={999} />
        </div>
        <div class="skeleton-d-stats">
          {Array.from({ length: STAT_COUNT }, (_, i) => (
            <div class="skeleton-d-stat" key={i}>
              <SkeletonLine width={30} height={13} />
              <SkeletonLine width={42} height={8} />
            </div>
          ))}
        </div>
      </div>

      {/* Action button row — mirrors .d-actions. */}
      <div class="skeleton-d-actions">
        <SkeletonBlock width={96} height="var(--h-control-sm)" />
        <SkeletonBlock width={74} height="var(--h-control-sm)" />
        <SkeletonBlock width={64} height="var(--h-control-sm)" />
        <SkeletonBlock width={84} height="var(--h-control-sm)" />
      </div>

      {/* Messages section — label + search box, then transcript cards. */}
      <div class="skeleton-d-section">
        <div class="skeleton-d-msg-header">
          <SkeletonLine width={104} height={11} />
          <SkeletonBlock width="100%" height="var(--h-control)" />
        </div>
        {MESSAGE_BLOCKS.map((b, i) => (
          <div
            class={cx("skeleton-d-msg", b.role === "user" && "is-user")}
            key={i}
            aria-hidden="true"
          >
            <SkeletonLine width={44} height={8} />
            {b.lines.map((w, j) => (
              <SkeletonLine key={j} width={w} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
