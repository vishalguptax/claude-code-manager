/**
 * Brain backup section — surfaces the export/import/diagnostics VS Code
 * commands under the Config tab so users don't have to hunt for them in
 * the palette. The webview just fires the commands; all file dialogs and
 * zip work run host-side. Actions use the shared <Button>.
 */
import { Button, Icon } from "../../../../../webview/shared/ui";
import type { ConfigApi } from "../../api";

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
          <Button iconName="upload" onClick={() => api.runCommand("claudeManager.exportBrain")}>
            Export Brain…
          </Button>
          <Button iconName="download" onClick={() => api.runCommand("claudeManager.importBrain")}>
            Import Brain…
          </Button>
          <Button
            iconName="info"
            title="Open a markdown report covering CLI presence, file health, hook paths, and version checks"
            onClick={() => api.runCommand("claudeManager.runDiagnostics")}
          >
            Run diagnostics
          </Button>
        </div>
      </div>
    </section>
  );
}
