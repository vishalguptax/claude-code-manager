/**
 * Session item component -- renders a single session row in the list.
 */

import { icon } from "../../../../webview/icons";
import { fmtRelativeTime } from "../../../../webview/utils";
import type { Session } from "../../types";

/**
 * Create a fresh session-item DOM node. Children that change with state
 * (name, time, prompt, branch, project, pin badge) are populated by
 * `updateSessionItemNode` so the create/update paths stay in sync —
 * one source of truth for DOM shape.
 *
 * data-id keeps the existing `bindSessionItems` delegation contract; the
 * keyed reconciler uses `data-key` set by the diff helper.
 */
export function createSessionItemNode(s: Session): HTMLElement {
  const root = document.createElement("div");
  root.className = "item session-item";
  root.dataset.id = s.id;

  const row1 = document.createElement("div");
  row1.className = "item-row1";
  const name = document.createElement("span");
  name.className = "item-name";
  const time = document.createElement("span");
  time.className = "item-time";
  row1.append(name, time);

  const resume = document.createElement("button");
  resume.className = "item-resume";
  resume.dataset.resume = s.id;
  resume.title = "Resume session";
  resume.innerHTML = icon("play");

  const prompt = document.createElement("div");
  prompt.className = "item-prompt";

  const row2 = document.createElement("div");
  row2.className = "item-row2";
  const branch = document.createElement("span");
  branch.className = "tag";
  const proj = document.createElement("span");
  proj.className = "item-proj";
  const pin = document.createElement("span");
  pin.className = "pin-icon";
  pin.title = "Pinned";
  pin.innerHTML = icon("pin");
  row2.append(branch, proj, pin);

  root.append(row1, resume, prompt, row2);
  return root;
}

/**
 * Patch a session-item node in place. Toggles only the classes /
 * attributes / text that actually changed so a search keystroke
 * touching 200 visible rows pays for the deltas, not for full DOM
 * reconstruction.
 */
export function updateSessionItemNode(
  node: HTMLElement,
  s: Session,
  isActive: boolean,
  isPinned: boolean,
  isSelected: boolean,
): void {
  if (node.dataset.id !== s.id) node.dataset.id = s.id;
  node.classList.toggle("active", isActive);
  node.classList.toggle("is-selected", isSelected);

  const displayName = s.name || s.prompts[0] || "Untitled session";
  const branch = s.branch && s.branch !== "HEAD" ? s.branch : "";
  const relTime = fmtRelativeTime(s.endTime);
  const absDate = new Date(s.endTime).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const firstPrompt = s.prompts[0] ?? "";
  const showSubPrompt = Boolean(s.name && firstPrompt);

  const row1 = node.firstChild as HTMLElement;
  const nameEl = row1.firstChild as HTMLElement;
  const timeEl = row1.lastChild as HTMLElement;
  if (nameEl.textContent !== displayName) nameEl.textContent = displayName;
  if (nameEl.title !== displayName) nameEl.title = displayName;
  if (timeEl.textContent !== relTime) timeEl.textContent = relTime;
  if (timeEl.title !== absDate) timeEl.title = absDate;

  const resume = row1.nextSibling as HTMLElement;
  if (resume.dataset.resume !== s.id) resume.dataset.resume = s.id;

  const prompt = resume.nextSibling as HTMLElement;
  if (showSubPrompt) {
    prompt.style.display = "";
    if (prompt.textContent !== firstPrompt) prompt.textContent = firstPrompt;
    if (prompt.title !== firstPrompt) prompt.title = firstPrompt;
  } else if (prompt.style.display !== "none") {
    prompt.style.display = "none";
  }

  const row2 = prompt.nextSibling as HTMLElement;
  const branchEl = row2.firstChild as HTMLElement;
  const projEl = branchEl.nextSibling as HTMLElement;
  const pinEl = row2.lastChild as HTMLElement;
  if (branch) {
    branchEl.style.display = "";
    if (branchEl.textContent !== branch) branchEl.textContent = branch;
    if (branchEl.title !== branch) branchEl.title = branch;
  } else if (branchEl.style.display !== "none") {
    branchEl.style.display = "none";
  }
  if (projEl.textContent !== s.project) projEl.textContent = s.project;
  if (projEl.title !== s.project) projEl.title = s.project;
  const pinHidden = !isPinned;
  const wasHidden = pinEl.style.display === "none";
  if (pinHidden !== wasHidden) pinEl.style.display = pinHidden ? "none" : "";
}

/**
 * Bind click, context-menu, and resume handlers on session items using
 * event delegation. A single listener per event type on the container
 * handles all items, avoiding O(n) listener creation on each render.
 *
 * Call this once during mount — delegation survives child mutation.
 * Uses getPinnedIds getter so the context menu always reads fresh state.
 */
export function bindSessionItems(
  container: HTMLElement,
  getPinnedIds: () => Set<string>,
  callbacks: {
    onSelect: (id: string) => void;
    onContextMenu: (e: MouseEvent, id: string, isPinned: boolean) => void;
    onResume: (id: string) => void;
    /**
     * True when the list is in bulk-select mode. While active, row
     * clicks fire `onSelectionToggle` instead of `onSelect`, and
     * the resume button is suppressed by CSS so the row is purely a
     * selection target.
     */
    isBulkMode: () => boolean;
    /**
     * Bulk-select toggle. `range` is true for shift-click — caller
     * extends the selection from the current anchor to this id.
     */
    onSelectionToggle: (id: string, range: boolean) => void;
  },
): void {
  container.addEventListener("click", (e: Event) => {
    const target = e.target as HTMLElement;

    // "Show more" button
    if (target.id === "showMore" || target.closest("#showMore")) return;

    // In bulk mode the row IS the selection target — no resume,
    // no detail. Shift-click extends the range from the anchor.
    if (callbacks.isBulkMode()) {
      const item = target.closest(".session-item") as HTMLElement | null;
      if (!item?.dataset.id) return;
      const ev = e as MouseEvent;
      callbacks.onSelectionToggle(item.dataset.id, ev.shiftKey === true);
      return;
    }

    // Resume button
    const resumeBtn = target.closest("[data-resume]") as HTMLElement | null;
    if (resumeBtn) {
      e.stopPropagation();
      const id = resumeBtn.dataset.resume;
      if (id) callbacks.onResume(id);
      return;
    }

    // Session item click
    const item = target.closest(".session-item") as HTMLElement | null;
    if (item?.dataset.id) {
      callbacks.onSelect(item.dataset.id);
    }
  });

  container.addEventListener("contextmenu", (e: Event) => {
    const item = (e.target as HTMLElement).closest(".session-item") as HTMLElement | null;
    if (!item?.dataset.id) return;
    e.preventDefault();
    const id = item.dataset.id;
    callbacks.onContextMenu(e as MouseEvent, id, getPinnedIds().has(id));
  });
}
