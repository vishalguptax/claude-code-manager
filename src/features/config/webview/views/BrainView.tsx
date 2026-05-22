/**
 * Brain backup section — surfaces the export/import/diagnostics VS Code
 * commands under the Config tab so users don't have to hunt for them in
 * the palette. The webview just fires the commands; all file dialogs and
 * zip work run host-side.
 */
import { Icon } from "../../../../webview/shared/ui";
import type { ConfigApi } from "../api";

export interface BrainViewProps {
  api: ConfigApi;
}

export function BrainView({ api }: BrainViewProps) {
  return (
    <section class="acct-section">
      <header class="acct-section-header">
        <h2 class="acct-section-title">
          <Icon name="package" size={14} /> Brain backup
        </h2>
      </header>
      <div class="acct-section-body">
        <div class="acct-field-hint">
          Share your Claude setup — skills, commands, agents, memory, hooks, MCP servers — across
          machines or teams as a single <code>.claudebrain.zip</code>. Sessions, credentials, and
          identity are never included.
        </div>
        <div class="acct-actions">
          <button class="btn" id="cfg-brain-export" onClick={() => api.runCommand("claudeManager.exportBrain")}>
            <Icon name="upload" size={14} /> Export Brain…
          </button>
          <button class="btn" id="cfg-brain-import" onClick={() => api.runCommand("claudeManager.importBrain")}>
            <Icon name="download" size={14} /> Import Brain…
          </button>
          <button
            class="btn"
            id="cfg-run-diagnostics"
            title="Open a markdown report covering CLI presence, file health, hook paths, and version checks"
            onClick={() => api.runCommand("claudeManager.runDiagnostics")}
          >
            <Icon name="info" size={14} /> Run diagnostics
          </button>
        </div>
      </div>
    </section>
  );
}
