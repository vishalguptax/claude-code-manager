/**
 * Filter controls for the session list: a debounced search box, project and
 * branch dropdowns, and the date-range chip row. Reads and writes the feature
 * signals directly — these controls are the single place those filter signals
 * change from the UI.
 *
 * The search field is the shared <SearchInput> (debounced, leading magnifier,
 * built-in clear); the refresh affordance beside it is an icon <Button>. The
 * project / branch selects are the shared themed <Dropdown>. The date range is
 * the shared <Segmented> control (selected segment is the subtle role token, not
 * primary blue).
 */
import {
  Button,
  Dropdown,
  type DropdownOption,
  SearchInput,
  Segmented,
  type SegmentedOption,
} from "../../../../../webview/shared/ui";
import type { DateFilter } from "../../../../../webview/types";
import { sendRefresh, sendSearchFullText } from "../../api";
import {
  clearFullTextHits,
  filterBranchSignal,
  filterDateSignal,
  filterProjectSignal,
  getBranchOptions,
  getProjectOptions,
  searchQuerySignal,
  visibleCountSignal,
} from "../../model";

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

function SearchBox() {
  // SearchInput owns the responsive local mirror + debounce; this fires once
  // per pause (or immediately on clear) with the resolved query.
  const onQuery = (raw: string): void => {
    const q = raw.toLowerCase();
    searchQuerySignal.value = q;
    visibleCountSignal.value = 30;
    if (q.length >= FULLTEXT_MIN_CHARS) sendSearchFullText(q);
    else clearFullTextHits();
  };

  return (
    <div class="search-row">
      <SearchInput
        value={searchQuerySignal.value}
        onInput={onQuery}
        debounceMs={SEARCH_DEBOUNCE_MS}
        placeholder="Search sessions..."
        ariaLabel="Search sessions"
      />
      <Button
        variant="icon"
        class="search-side-btn"
        iconName="refresh-cw"
        title="Refresh sessions"
        onClick={() => sendRefresh()}
      />
    </div>
  );
}

function ProjectSelect() {
  const value = filterProjectSignal.value;
  const options: DropdownOption[] = getProjectOptions().map((o) => ({
    value: o.value,
    label: o.label,
    badge: o.count,
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
        visibleCountSignal.value = 30;
      }}
    />
  );
}

function BranchSelect() {
  const value = filterBranchSignal.value;
  const branchOptions = getBranchOptions();
  // branchOptions always leads with "All Branches"; with <=1 real branch after
  // it there is nothing meaningful to filter by, so hide the control entirely
  // (matches v1, which hid when `branches.length <= 1`).
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
        visibleCountSignal.value = 30;
      }}
    />
  );
}

function DateChips() {
  return (
    <div class="date-chips">
      <Segmented
        ariaLabel="Date range"
        value={filterDateSignal.value}
        options={DATE_OPTIONS}
        onChange={(next) => {
          filterDateSignal.value = next;
          visibleCountSignal.value = 30;
        }}
      />
    </div>
  );
}

export function Filters() {
  return (
    <>
      <SearchBox />
      <div class="filter-row">
        <ProjectSelect />
        <BranchSelect />
      </div>
      <DateChips />
    </>
  );
}
