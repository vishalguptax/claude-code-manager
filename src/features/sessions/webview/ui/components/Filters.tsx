/**
 * Filter controls for the session list.
 *
 * Four filters (project, branch, worktree, date) used three permanent rows —
 * two dropdowns, an optional third, and a segmented date control — stacked
 * above the list on every visit whether or not any of them were set. Together
 * with the launch toolbar that put the first session row a quarter of the way
 * down the panel.
 *
 * They are now progressive: search is always there, because it is used
 * constantly; the pickers live behind the funnel; and a filter that IS set
 * shows as a removable chip, so the row costs nothing when nothing is filtered
 * and always says what is currently narrowing the list when something is.
 *
 * The chips are also the answer to a question the old row could not: with four
 * dropdowns sitting at their defaults, "why am I not seeing that session?"
 * required reading all four. Now anything narrowing the list is a chip, and
 * removing it is one click.
 */
import { useState } from "preact/hooks";
import {
  Button,
  Dropdown,
  type DropdownOption,
  Icon,
  SearchInput,
  Segmented,
  type SegmentedOption,
} from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import type { DateFilter } from "../../../../../webview/types";
import { sendRefresh, sendSearchFullText } from "../../api";
import {
  clearFullTextHits,
  filterBranchSignal,
  filterDateSignal,
  filterProjectSignal,
  filterWorktreeSignal,
  fullTextLoadingSignal,
  getBranchOptions,
  getProjectOptions,
  getWorktreeOptions,
  hasWorktreeSessions,
  markFullTextLoading,
  searchQuerySignal,
} from "../../model";
import type { WorktreeFilter } from "../../model";

/**
 * Minimum query length before asking the host for a transcript scan. Below
 * this, metadata matches from `searchHaystack` are enough and a host scan
 * returns thousands of low-value hits.
 */
const FULLTEXT_MIN_CHARS = 2;
/** Debounce window for search input, per sessions special-consideration F. */
const SEARCH_DEBOUNCE_MS = 250;

const DATE_OPTIONS: SegmentedOption<DateFilter>[] = [
  { value: "recent", label: "Recent" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All" },
];

/**
 * "Show everything" for each filter. A filter sitting on this value is not
 * narrowing anything, so it gets no chip; a chip's × restores it.
 *
 * Note `project` widens to "all", not back to "current". Showing only the
 * current project IS a filter — it hides sessions — so it reads as a chip like
 * any other, and clearing it does what clearing a filter should.
 */
const WIDEST = {
  date: "all" as DateFilter,
  project: "all",
  branch: "all",
  worktree: "all" as WorktreeFilter,
};

function SearchBox() {
  // SearchInput owns the responsive local mirror + debounce; this fires once
  // per pause (or immediately on clear) with the resolved query.
  const onQuery = (raw: string): void => {
    const q = raw.toLowerCase();
    searchQuerySignal.value = q;
    if (q.length >= FULLTEXT_MIN_CHARS) {
      markFullTextLoading();
      sendSearchFullText(q);
    } else {
      clearFullTextHits();
    }
  };

  return (
    <SearchInput
      value={searchQuerySignal.value}
      onInput={onQuery}
      debounceMs={SEARCH_DEBOUNCE_MS}
      placeholder="Search sessions and transcripts"
      ariaLabel="Search sessions"
    />
  );
}

function ProjectSelect() {
  const value = filterProjectSignal.value;
  const options: DropdownOption[] = getProjectOptions().map((o) => ({
    value: o.value,
    label: o.label,
    badge: o.count,
    marker: o.isCurrent ? "current" : undefined,
  }));
  return (
    <Dropdown
      ariaLabel="Filter by project"
      value={value}
      options={options}
      onChange={(next) => {
        // Picking a project resets the branch filter — a branch from the
        // previous project would have zero matching sessions here.
        filterProjectSignal.value = next;
        filterBranchSignal.value = "all";
      }}
    />
  );
}

function BranchSelect() {
  const value = filterBranchSignal.value;
  const branchOptions = getBranchOptions();
  // branchOptions always leads with "All Branches"; with <=1 real branch after
  // it there is nothing meaningful to filter by, so hide the control entirely.
  if (branchOptions.length <= 2) return null;
  const options: DropdownOption[] = branchOptions.map((o) => ({
    value: o.value,
    label: o.label,
    badge: o.count,
    marker: o.isCurrent ? "current" : undefined,
  }));
  return (
    <Dropdown
      ariaLabel="Filter by branch"
      title="Filter sessions by git branch"
      icon="git-branch"
      value={value}
      options={options}
      onChange={(next) => {
        filterBranchSignal.value = next;
      }}
    />
  );
}

function WorktreeSelect() {
  // Hidden unless the list actually contains Claude/user worktree sessions —
  // with none present the control would only ever offer "All".
  if (!hasWorktreeSessions()) return null;
  const value = filterWorktreeSignal.value;
  const options: DropdownOption[] = getWorktreeOptions().map((o) => ({
    value: o.value,
    label: o.label,
    badge: o.count,
  }));
  return (
    <Dropdown
      ariaLabel="Filter by worktree"
      title="Filter sessions by git worktree"
      icon="split-square-horizontal"
      value={value}
      options={options}
      onChange={(next) => {
        filterWorktreeSignal.value = next as WorktreeFilter;
      }}
    />
  );
}

/** One active filter, shown as a chip whose × widens that filter again. */
function FilterChip({
  label,
  title,
  icon,
  onClear,
}: {
  label: string;
  title: string;
  icon?: string;
  onClear: () => void;
}) {
  return (
    <span class="filter-chip" title={title}>
      {icon ? <Icon name={icon} size={11} /> : null}
      <span class="filter-chip-label">{label}</span>
      <button
        type="button"
        class="filter-chip-clear"
        aria-label={`Clear filter: ${title}`}
        onClick={onClear}
      >
        <Icon name="x" size={11} />
      </button>
    </span>
  );
}

/** Label for the active project filter, resolved from the dropdown options. */
function projectLabel(value: string): string {
  return getProjectOptions().find((o) => o.value === value)?.label ?? value;
}

function ActiveChips() {
  const date = filterDateSignal.value;
  const project = filterProjectSignal.value;
  const branch = filterBranchSignal.value;
  const worktree = filterWorktreeSignal.value;

  const chips = [
    date !== WIDEST.date && (
      <FilterChip
        key="date"
        label={DATE_OPTIONS.find((o) => o.value === date)?.label ?? date}
        title="Date range"
        onClear={() => {
          filterDateSignal.value = WIDEST.date;
        }}
      />
    ),
    project !== WIDEST.project && (
      <FilterChip
        key="project"
        label={projectLabel(project)}
        title="Project"
        onClear={() => {
          filterProjectSignal.value = WIDEST.project;
        }}
      />
    ),
    branch !== WIDEST.branch && (
      <FilterChip
        key="branch"
        label={branch}
        title="Git branch"
        icon="git-branch"
        onClear={() => {
          filterBranchSignal.value = WIDEST.branch;
        }}
      />
    ),
    worktree !== WIDEST.worktree && (
      <FilterChip
        key="worktree"
        label={getWorktreeOptions().find((o) => o.value === worktree)?.label ?? worktree}
        title="Worktree"
        icon="split-square-horizontal"
        onClear={() => {
          filterWorktreeSignal.value = WIDEST.worktree;
        }}
      />
    ),
  ].filter(Boolean);

  if (chips.length === 0) return null;

  return (
    <div class="filter-chips" role="group" aria-label="Active filters">
      {chips}
      {/* Clearing one at a time is fine for two; past that it is a chore. */}
      {chips.length > 2 ? (
        <button
          type="button"
          class="filter-chip-clear-all"
          onClick={() => {
            filterDateSignal.value = WIDEST.date;
            filterProjectSignal.value = WIDEST.project;
            filterBranchSignal.value = WIDEST.branch;
            filterWorktreeSignal.value = WIDEST.worktree;
          }}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

export function Filters() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div class="search-row">
        <SearchBox />
        {fullTextLoadingSignal.value ? (
          <span class="search-spinner" role="status" aria-label="Searching transcripts" />
        ) : null}
        <Button
          variant="icon"
          class={cx("search-side-btn", open && "is-open")}
          iconName="sliders-horizontal"
          title={open ? "Hide filters" : "Filter sessions"}
          ariaLabel="Filter sessions"
          onClick={() => setOpen((v) => !v)}
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="refresh-cw"
          title="Refresh sessions"
          ariaLabel="Refresh sessions"
          onClick={() => sendRefresh()}
        />
      </div>

      <ActiveChips />

      {open ? (
        <div class="filter-panel">
          <div class="filter-row">
            <ProjectSelect />
            <BranchSelect />
            <WorktreeSelect />
          </div>
          <div class="date-chips">
            <Segmented
              ariaLabel="Date range"
              value={filterDateSignal.value}
              options={DATE_OPTIONS}
              onChange={(next) => {
                filterDateSignal.value = next;
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
