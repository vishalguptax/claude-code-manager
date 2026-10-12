/**
 * The explorer's navigation pane: Sessions (home) with its folders beneath
 * it as a tree, then the cross-cutting views — All sessions, Pinned,
 * Archived. Every entry but All is also a drop target (see explorerDnd).
 */
import { useState } from "preact/hooks";
import { Icon } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import { type ExplorerLocation, HOME, locationKey, sameLocation } from "../../lib";
import {
  canDropOn,
  dropOnLocation,
  effectiveLocationSignal,
  explorerCountsSignal,
  folderNamesSignal,
  navigate,
} from "../../model";
import { useDropTarget } from "./explorerDnd";

const VIEWS: { loc: ExplorerLocation; label: string; icon: string }[] = [
  { loc: { kind: "all" }, label: "All sessions", icon: "inbox" },
  { loc: { kind: "pinned" }, label: "Pinned", icon: "pin" },
  { loc: { kind: "archived" }, label: "Archived", icon: "archive" },
];

interface EntryProps {
  loc: ExplorerLocation;
  label: string;
  icon: string;
  /** True for a folder, drawn one level under Sessions. */
  nested?: boolean;
  /** Present on Sessions only: its folders' disclosure state. */
  expanded?: boolean;
  onToggle?: () => void;
  onFolderMenu?: (name: string, x: number, y: number) => void;
}

function NavEntry({ loc, label, icon, nested, expanded, onToggle, onFolderMenu }: EntryProps) {
  const active = sameLocation(effectiveLocationSignal.value, loc);
  const count = explorerCountsSignal.value.get(locationKey(loc)) ?? 0;
  const drop = useDropTarget(canDropOn(loc) ? (ids) => dropOnLocation(loc, ids) : null);
  return (
    <div
      class={cx("xp-nav-row", { active, nested, "is-drop": drop.over })}
      {...drop.props}
    >
      {onToggle ? (
        <button
          type="button"
          class={cx("xp-nav-twisty", { collapsed: !expanded })}
          aria-label={expanded ? "Collapse folders" : "Expand folders"}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <Icon name="chevron-down" size={12} />
        </button>
      ) : (
        <span class="xp-nav-twisty-space" aria-hidden="true" />
      )}
      <button
        type="button"
        class="xp-nav-item"
        aria-current={active ? "page" : undefined}
        title={label}
        onClick={() => navigate(loc)}
        onContextMenu={
          loc.kind === "folder" && onFolderMenu
            ? (e: MouseEvent) => {
                e.preventDefault();
                onFolderMenu(loc.name, e.clientX, e.clientY);
              }
            : undefined
        }
      >
        <Icon name={icon} size={14} />
        <span class="xp-nav-label">{label}</span>
        {count > 0 ? <span class="xp-nav-count">{count}</span> : null}
      </button>
    </div>
  );
}

export interface ExplorerNavProps {
  onFolderMenu: (name: string, x: number, y: number) => void;
}

export function ExplorerNav({ onFolderMenu }: ExplorerNavProps) {
  const [expanded, setExpanded] = useState(true);
  return (
    <nav class="xp-nav" aria-label="Locations">
      <NavEntry
        loc={HOME}
        label="Sessions"
        icon="folder"
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded
        ? folderNamesSignal.value.map((name) => (
            <NavEntry
              key={name}
              loc={{ kind: "folder", name }}
              label={name}
              icon="folder"
              nested
              onFolderMenu={onFolderMenu}
            />
          ))
        : null}
      <div class="xp-nav-heading">Views</div>
      {VIEWS.map((v) => (
        <NavEntry key={v.label} {...v} />
      ))}
    </nav>
  );
}
