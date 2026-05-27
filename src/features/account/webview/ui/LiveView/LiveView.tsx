/**
 * Current-session section — live model / context-window usage / cost,
 * read from the same statusline cache as Quota (no network call). These
 * reflect the most recently active Claude Code session; the section
 * hides itself entirely when the cache holds no session metrics, so it
 * never shows an empty shell before the user has run Claude.
 */

import type { LiveSession } from "../../../quota";
import { formatNumber } from "../../lib";
import { isSectionCollapsed, quotaStatus, toggleSection } from "../../model";
import { MetaRow } from "../MetaRow";
import { SectionHeader } from "../SectionHeader";

/** True when the cache carried at least one session metric worth showing. */
function hasLive(live: LiveSession): boolean {
  return (
    live.model !== "" ||
    live.contextUsedPercent !== null ||
    live.sessionCostUsd !== null
  );
}

function contextLabel(live: LiveSession): string {
  const pct = `${Math.round(live.contextUsedPercent ?? 0)}%`;
  return live.contextSize ? `${pct} of ${formatNumber(live.contextSize)}` : pct;
}

/** "+214 / −179" when either counter is present, else "". */
function editsLabel(live: LiveSession): string {
  if (live.linesAdded === null && live.linesRemoved === null) return "";
  return `+${live.linesAdded ?? 0} / −${live.linesRemoved ?? 0}`;
}

export function LiveView() {
  const status = quotaStatus.value;
  if (status.kind !== "success") return null;
  const live = status.data.live;
  if (!hasLive(live)) return null;

  const collapsed = isSectionCollapsed("session");
  const edits = editsLabel(live);

  return (
    <section class="acct-section">
      <SectionHeader
        id="session"
        title="Current session"
        collapsed={collapsed}
        onToggle={toggleSection}
      />
      {collapsed ? null : (
        <div class="acct-section-body">
          <div class="acct-meta">
            {live.model ? <MetaRow k="Model" v={live.model} /> : null}
            {live.contextUsedPercent !== null ? (
              <MetaRow k="Context" v={contextLabel(live)} numeric />
            ) : null}
            {live.sessionCostUsd !== null ? (
              <MetaRow k="Session cost" v={`$${live.sessionCostUsd.toFixed(2)}`} numeric />
            ) : null}
            {edits ? <MetaRow k="Edits" v={edits} numeric /> : null}
          </div>
        </div>
      )}
    </section>
  );
}
