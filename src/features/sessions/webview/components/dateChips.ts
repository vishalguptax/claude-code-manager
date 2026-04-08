/**
 * Date chips component -- renders the date filter toggle buttons.
 */

import type { DateFilter } from "../../../../webview/types";
import {
  getFilterDate,
  setFilterDate,
  setVisibleCount,
} from "../state";

/**
 * Render the date chips HTML string.
 * @returns HTML for the date filter chip row
 */
export function renderDateChips(): string {
  const filterDate = getFilterDate();
  return `
    <div class="date-chips">
      <button class="chip ${filterDate === "recent" ? "active" : ""}" data-date="recent" title="20 most recent sessions">Recent</button>
      <button class="chip ${filterDate === "week" ? "active" : ""}" data-date="week">Week</button>
      <button class="chip ${filterDate === "month" ? "active" : ""}" data-date="month">Month</button>
      <button class="chip ${filterDate === "all" ? "active" : ""}" data-date="all">All</button>
    </div>`;
}

/**
 * Bind click event listeners to all date chip buttons.
 * @param onUpdate - Callback invoked after the date filter changes
 */
export function bindDateChips(onUpdate: () => void): void {
  document.querySelectorAll(".chip[data-date]").forEach((c) =>
    c.addEventListener("click", () => {
      const value = (c as HTMLElement).dataset.date as DateFilter;
      setFilterDate(value);
      setVisibleCount(30);
      document.querySelectorAll(".chip[data-date]").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      onUpdate();
    })
  );
}
