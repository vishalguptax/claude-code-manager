/**
 * Top row of session-launch actions: new session, temp session, continue
 * last, restore the last working set of terminals, import one portable
 * session file, and bulk-import many at once.
 *
 * Each action is a shared <Button>; "New" leads as the primary call to action,
 * the rest are secondary. The `.actions-bar` grid (shared CSS) lays them out in
 * an auto-fit row that wraps gracefully on narrow panels.
 */
import { Button } from "../../../../../webview/shared/ui";
import {
  sendContinueLastSession,
  sendImportMultipleSessions,
  sendImportSession,
  sendNewSession,
  sendNewTempSession,
  sendResumeMultiple,
} from "../../api";
import { getLastSessionGroup } from "../../model";

export function ActionsBar() {
  return (
    <div class="actions-bar">
      <Button
        iconName="plus"
        title="Start a new Claude Code session in a fresh terminal"
        onClick={() => sendNewSession()}
      >
        New
      </Button>
      <Button
        iconName="ghost"
        title="Start a temporary Claude session — transcript and history rows are deleted when the terminal closes"
        onClick={() => sendNewTempSession()}
      >
        Temp
      </Button>
      <Button
        iconName="history"
        title="Continue your most recent Claude session in this workspace (claude --continue)"
        onClick={() => sendContinueLastSession()}
      >
        Continue
      </Button>
      <Button
        iconName="split-square-horizontal"
        title="Reopen all terminals from your last working session"
        onClick={() => {
          const group = getLastSessionGroup();
          if (group.length) {
            sendResumeMultiple(
              group.map((s) => s.id),
              group.map((s) => s.projectPath),
            );
          }
        }}
      >
        Restore
      </Button>
      <Button
        iconName="download"
        title="Import a single session exported from another machine (resumes it immediately)"
        onClick={() => sendImportSession()}
      >
        Import
      </Button>
      <Button
        iconName="package"
        title="Import many sessions at once from a .zip archive and/or several .jsonl files — existing sessions are kept"
        onClick={() => sendImportMultipleSessions()}
      >
        Import Many
      </Button>
    </div>
  );
}
