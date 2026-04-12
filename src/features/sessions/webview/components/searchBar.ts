/**
 * Search bar component -- renders the search input row and handles search events.
 */

import {
  setSearchQuery,
  setVisibleCount,
} from "../state";
import { icon } from "../../../../webview/icons";

let searchTimer: ReturnType<typeof setTimeout>;

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
 */
function onSearch(onUpdate: () => void): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const input = document.getElementById("search") as HTMLInputElement | null;
    if (!input) return;
    setSearchQuery(input.value.toLowerCase());
    setVisibleCount(30);
    document.getElementById("searchClear")?.classList.toggle("is-hidden", !input.value);
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
  document.getElementById("searchClear")?.classList.add("is-hidden");
  onUpdate();
  input.focus();
}
