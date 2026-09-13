/**
 * The session-launch toolbar.
 *
 * There are six ways to start or recover a session, and they used to be six
 * equal-weight buttons in an auto-fit grid. At the default sidebar width that
 * wrapped to two rows and at 280px to three, so the list of sessions — the
 * reason the panel exists — started a third of the way down the panel. Six
 * peers also answer no question: nothing said which one you want.
 *
 * "New session" leads, because it is what nearly every visit wants. Continue
 * sits beside it as an icon, because resuming the last session is the common
 * second answer and deserves one click. The remaining four are variations on
 * starting a session and live in the split menu, one keystroke away, where
 * they cost no vertical space at any width.
 */
import { useRef, useState } from "preact/hooks";
import { Button, Menu, type MenuItem } from "../../../../../webview/shared/ui";
import {
  sendContinueLastSession,
  sendImportMultipleSessions,
  sendImportSession,
  sendNewSession,
  sendNewTempSession,
  sendResumeMultiple,
} from "../../api";
import { getLastSessionGroup } from "../../model";

/** Reopen terminals for the most recent sessions in this project. */
function restoreWorkspace(): void {
  // Always post, even for an empty group: the host owns every user-facing
  // message (only it can call the vscode dialog API), so it reports "nothing
  // to restore" rather than this click silently doing nothing.
  const group = getLastSessionGroup();
  sendResumeMultiple(
    group.map((s) => s.id),
    group.map((s) => s.projectPath),
  );
}

export function ActionsBar() {
  const moreRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const openMenu = (): void => {
    const rect = moreRef.current?.getBoundingClientRect();
    // Anchor under the trigger's RIGHT edge: Menu flips left when the popup
    // would overflow, and this trigger sits at the end of the row, so the
    // popup should open back across the panel rather than off it.
    setMenu({ x: rect?.right ?? 0, y: rect?.bottom ?? 0 });
  };

  const items: MenuItem[] = [
    {
      label: "New temporary session",
      icon: "ghost",
      onSelect: () => sendNewTempSession(),
    },
    {
      label: "Restore recent terminals",
      icon: "split-square-horizontal",
      separatorBefore: true,
      onSelect: restoreWorkspace,
    },
    {
      label: "Import a session…",
      icon: "download",
      separatorBefore: true,
      onSelect: () => sendImportSession(),
    },
    {
      label: "Import many…",
      icon: "package",
      onSelect: () => sendImportMultipleSessions(),
    },
  ];

  return (
    <div class="actions-bar">
      <Button
        variant="primary"
        class="actions-new"
        iconName="plus"
        title="Start a new Claude Code session in a fresh terminal"
        onClick={() => sendNewSession()}
      >
        New Session
      </Button>
      <Button
        variant="icon"
        iconName="history"
        title="Continue your most recent session in this workspace (claude --continue)"
        ariaLabel="Continue last session"
        onClick={() => sendContinueLastSession()}
      />
      {/* The trigger is wrapped so Menu can be told to ignore outside presses
          on it — without that the document listener closes on pointerdown and
          this click immediately reopens, which reads as a flicker. */}
      <div ref={moreRef} class="actions-more">
        <Button
          variant="icon"
          iconName="more-horizontal"
          title="More ways to start a session"
          ariaLabel="More session actions"
          onClick={openMenu}
        />
      </div>
      <Menu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={items}
        anchorRef={moreRef}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
