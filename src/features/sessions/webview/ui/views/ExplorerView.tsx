/**
 * The sessions explorer, laid out like a file manager:
 *
 *   ┌ top bar: back · up · search ────────────────────────────────────┐
 *   ├ command bar: new folder · move · pin · … · project · sort · view ┤
 *   │ navigation │ content (details or tiles)          │ preview      │
 *   └ status bar: Sessions › folder · N items · M selected ───────────┘
 *
 * The sidebar is for getting back to work; this is for seeing everything at
 * once and putting it in order.
 */
import { useState } from "preact/hooks";
import { ContextMenu, EmptyState } from "../../../../../webview/shared/ui";
import { locationLabel } from "../../lib";
import {
  archivedSignal,
  effectiveLocationSignal,
  explorerItemsSignal,
  explorerPreviewOpenSignal,
  explorerViewModeSignal,
  pinnedSignal,
  searchQuerySignal,
  selectedItemsSignal,
  selectedSessionIdsSignal,
  tempSessionsSignal,
} from "../../model";
import { ExplorerCommandBar, ExplorerStatusBar, ExplorerTopBar } from "../components/ExplorerBars";
import { ExplorerItems, type MenuRequest } from "../components/ExplorerItems";
import { ExplorerNav } from "../components/ExplorerNav";
import { ExplorerPreview } from "../components/ExplorerPreview";
import { buildExplorerMenu } from "../components/explorerMenu";
import { buildFolderMenuItems } from "../components/sessionMenu";

type OpenMenu = MenuRequest | { x: number; y: number; navFolder: string };

function EmptyContent({ onMenu }: { onMenu: (req: MenuRequest) => void }) {
  const loc = effectiveLocationSignal.value;
  const searching = searchQuerySignal.value !== "";
  let title = "Nothing here";
  let description = "";
  if (searching) {
    title = "No matches";
    description = `Nothing in ${locationLabel(loc)} matches “${searchQuerySignal.value}”.`;
  } else if (loc.kind === "folder") {
    title = "This folder is empty";
    description = "Drag sessions onto it, or select some and use Move to….";
  } else if (loc.kind === "home") {
    title = "No sessions in this project";
    description = "Pick another project above, or start a session from the sidebar.";
  }
  return (
    <div
      class="xp-items xp-items-empty"
      onContextMenu={(e: MouseEvent) => {
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY, item: null });
      }}
    >
      <EmptyState icon={searching ? "search-slash" : "folder"} title={title} description={description} />
    </div>
  );
}

export function ExplorerView() {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const preview = explorerPreviewOpenSignal.value;
  const empty = explorerItemsSignal.value.length === 0;

  const menuItems = (): ReturnType<typeof buildExplorerMenu> => {
    if (!menu) return [];
    if ("navFolder" in menu) return buildFolderMenuItems(menu.navFolder);
    return buildExplorerMenu(menu.item, {
      selectedCount: selectedItemsSignal.value.length,
      selectedSessionIds: selectedSessionIdsSignal.value,
      pinned: pinnedSignal.value,
      archived: archivedSignal.value,
      temp: tempSessionsSignal.value,
      inArchive: effectiveLocationSignal.value.kind === "archived",
      viewMode: explorerViewModeSignal.value,
      setViewMode: (mode) => {
        explorerViewModeSignal.value = mode;
      },
    });
  };

  return (
    <div class={preview ? "xp" : "xp no-preview"}>
      <ExplorerTopBar />
      <ExplorerCommandBar />
      <ExplorerNav onFolderMenu={(navFolder, x, y) => setMenu({ navFolder, x, y })} />
      <main class="xp-main" aria-label={locationLabel(effectiveLocationSignal.value)}>
        {empty ? <EmptyContent onMenu={setMenu} /> : <ExplorerItems onMenu={setMenu} />}
      </main>
      {preview ? <ExplorerPreview /> : null}
      <ExplorerStatusBar />
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menuItems()}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
