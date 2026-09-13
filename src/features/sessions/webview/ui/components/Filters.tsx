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
 * constantly; the pickers live behind the toggle; and a filter narrowed PAST
 * the user's own default shows as a removable chip. So the row costs nothing
 * at rest and always says what is narrowing the list when something is.
 *
 * "Past the user's own default" is the load-bearing part. An earlier version
 * compared against a hardcoded widest value, which put "Recent" and "This
 * Project" on screen for everyone permanently — the configured defaults are
 * filters, so every user saw two chips at rest and the row was just the old
 * filter bar with fewer controls. Comparing against the configured defaults is
 * what lets the chip row replace three permanent rows instead of joining them.
 *
 * The chips also answer a question the old row could not: with four dropdowns
 * resting at their defaults, "why am I not seeing that session?" meant reading
 * all four. Now anything narrowing past your baseline is a chip, and removing
 * it is one click.
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
  defaultDateSignal,
  defaultProjectSignal,
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
 * "Show everything" for branch and worktree. Neither has a user-configurable
 * default, so "all" is both their resting value and what a chip's × restores.
 *
 * Date and project are different: the user configures their own defaults
 * (`sessions.defaultFilter` / `defaultProject`), so those are read from the
 * signals the host push sets. Clearing one of those chips returns to the
 * user's default rather than to "all" — the point of a chip is "you have
 * narrowed past your own baseline", and taking someone back past their own
 * setting is not clearing a filter, it is overriding a preference.
 */
const WIDEST = {
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
  const defaultDate = defaultDateSignal.value;
  const defaultProject = defaultProjectSignal.value;

  const chips = [
    date !== defaultDate && (
      <FilterChip
        key="date"
        label={DATE_OPTIONS.find((o) => o.value === date)?.label ?? date}
        title="Date range"
        onClear={() => {
          filterDateSignal.value = defaultDate;
        }}
      />
    ),
    project !== defaultProject && (
      <FilterChip
        key="project"
        label={projectLabel(project)}
        title="Project"
        onClear={() => {
          filterProjectSignal.value = defaultProject;
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
            filterDateSignal.value = defaultDate;
            filterProjectSignal.value = defaultProject;
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
