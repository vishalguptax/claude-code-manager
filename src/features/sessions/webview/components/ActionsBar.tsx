/**
 * Top row of session-launch actions: new session, temp session, continue
 * last, restore the last working set of terminals, and import a portable
 * session file.
 */
import { Icon } from "../../../../webview/components/Icon";
import {
  sendContinueLastSession,
  sendImportSession,
  sendNewSession,
  sendNewTempSession,
  sendResumeMultiple,
} from "../api";
import { getLastSessionGroup } from "../signals";

export function ActionsBar() {
  return (
    <div class="actions-bar">
      <button
        type="button"
        class="action-btn"
        title="Start a new Claude Code session in a fresh terminal"
        onClick={() => sendNewSession()}
      >
        <Icon name="plus" /> New
      </button>
      <button
        type="button"
        class="action-btn"
        title="Start a temporary Claude session — transcript and history rows are deleted when the terminal closes"
        onClick={() => sendNewTempSession()}
      >
        <Icon name="ghost" /> Temp
      </button>
      <button
        type="button"
        class="action-btn"
        title="Continue your most recent Claude session in this workspace (claude --continue)"
        onClick={() => sendContinueLastSession()}
      >
        <Icon name="history" /> Continue
      </button>
      <button
        type="button"
        class="action-btn"
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
        <Icon name="split-square-horizontal" /> Restore Workspace
      </button>
      <button
        type="button"
        class="action-btn"
        title="Import a session exported from another machine"
        onClick={() => sendImportSession()}
      >
        <Icon name="download" /> Import
      </button>
    </div>
  );
}
