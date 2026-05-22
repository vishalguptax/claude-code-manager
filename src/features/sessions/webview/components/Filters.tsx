/**
 * Filter controls for the session list: a debounced search box, project and
 * branch dropdowns, and the date-range chip row. Reads and writes the feature
 * signals directly — these controls are the single place those filter signals
 * change from the UI.
 */
import { useEffect, useState } from "preact/hooks";
import { Dropdown, type DropdownOption } from "../../../../webview/shared/ui";
import { Icon } from "../../../../webview/shared/ui";
import { useDebounce } from "../../../../webview/shared/hooks";
import { cx } from "../../../../webview/shared/lib";
import type { DateFilter } from "../../../../webview/types";
import { sendRefresh, sendSearchFullText } from "../api";
import {
  clearFullTextHits,
  filterBranchSignal,
  filterDateSignal,
  filterProjectSignal,
  getBranchOptions,
  getProjectOptions,
  searchQuerySignal,
  visibleCountSignal,
} from "../signals";

/**
 * Minimum query length before asking the host for a transcript scan. Below
 * this, metadata matches from `searchHaystack` are enough and a host scan
 * returns thousands of low-value hits.
 */
const FULLTEXT_MIN_CHARS = 2;
/** Debounce window for search input, per sessions special-consideration F. */
const SEARCH_DEBOUNCE_MS = 250;

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All" },
];

function SearchBox() {
  const [raw, setRaw] = useState(searchQuerySignal.value);
  const debounced = useDebounce(raw, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    const q = debounced.toLowerCase();
    searchQuerySignal.value = q;
    visibleCountSignal.value = 30;
    if (q.length >= FULLTEXT_MIN_CHARS) sendSearchFullText(q);
    else clearFullTextHits();
  }, [debounced]);

  return (
    <div class="search-row">
      <div class="feature-search">
        <input
          id="search"
          type="text"
          placeholder="Search sessions..."
          value={raw}
          onInput={(e) => setRaw((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setRaw("");
          }}
        />
        {raw ? (
          <button
            type="button"
            class="search-btn"
            id="searchClear"
            title="Clear (Esc)"
            onClick={() => setRaw("")}
          >
            <Icon name="x" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        class="search-side-btn"
        id="sessionsRefresh"
        title="Refresh sessions"
        onClick={() => sendRefresh()}
      >
        <Icon name="refresh-cw" size={14} />
      </button>
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
  const active = filterDateSignal.value;
  return (
    <div class="date-chips" role="tablist" aria-label="Date range">
      {DATE_OPTIONS.map((o) => (
        <button
          type="button"
          key={o.value}
          class={cx("chip", { active: active === o.value })}
          aria-selected={active === o.value}
          onClick={() => {
            filterDateSignal.value = o.value;
            visibleCountSignal.value = 30;
          }}
        >
          {o.label}
        </button>
      ))}
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
