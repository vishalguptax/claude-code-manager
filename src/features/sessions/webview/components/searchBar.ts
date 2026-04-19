/**
 * Search bar component -- renders the search input row and handles search events.
 */

import {
  setSearchQuery,
  setVisibleCount,
  clearFullTextHits,
} from "../state";
import { sendSearchFullText } from "../api";
import { icon } from "../../../../webview/icons";

let searchTimer: ReturnType<typeof setTimeout>;
/**
 * Minimum query length to trigger a full-text (transcript content) scan.
 * Below this the extension-host scan returns thousands of hits that only
 * slow the render — metadata matches from `searchHaystack` are enough.
 */
const FULLTEXT_MIN_CHARS = 2;

/**
 * Render the search bar HTML string.
 * @returns HTML for the search input row
 */
export function renderSearchBar(): string {
  return `
    <div class="search-row">
      <div class="feature-search">
        <input id="search" type="text" placeholder="Search sessions..." />
        <button class="search-btn is-hidden" id="searchClear" title="Clear (Esc)">${icon("x")}</button>
      </div>
      <button class="search-side-btn" id="sessionsRefresh" title="Refresh sessions">${icon("refresh-cw", 14)}</button>
    </div>`;
}

/**
 * Bind event listeners for the search bar.
 * @param onUpdate - Callback invoked after the search query changes
 */
export function bindSearchBar(onUpdate: () => void): void {
  document.getElementById("search")?.addEventListener("input", () => onSearch(onUpdate));
  document.getElementById("searchClear")?.addEventListener("click", () => clearSearch(onUpdate));
  document.getElementById("search")?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") clearSearch(onUpdate);
  });
}

/**
 * Handle search input with a 150ms debounce.
 *
 * Metadata search (name/project/branch/summary) runs entirely in-browser
 * via `searchHaystack`, so it reacts instantly. Full-text (transcript
 * content) search is dispatched to the extension host because the index
 * is too large to ship to the webview. The reply arrives asynchronously
 * and the list re-renders when it does.
 */
function onSearch(onUpdate: () => void): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const input = document.getElementById("search") as HTMLInputElement | null;
    if (!input) return;
    const q = input.value.toLowerCase();
    setSearchQuery(q);
    setVisibleCount(30);
    document.getElementById("searchClear")?.classList.toggle("is-hidden", !input.value);
    if (q.length >= FULLTEXT_MIN_CHARS) {
      sendSearchFullText(q);
    } else {
      // Clear stale hits below the minimum threshold so a 1-char query
      // does not keep showing transcript matches from a longer query.
      clearFullTextHits();
    }
    onUpdate();
  }, 150);
}

/**
 * Clear the search input and reset the query filter.
 */
function clearSearch(onUpdate: () => void): void {
  const input = document.getElementById("search") as HTMLInputElement | null;
  if (!input) return;
  input.value = "";
  setSearchQuery("");
  clearFullTextHits();
  document.getElementById("searchClear")?.classList.add("is-hidden");
  onUpdate();
  input.focus();
}
