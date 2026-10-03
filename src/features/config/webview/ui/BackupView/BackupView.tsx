/**
 * Backup & tools: moving a Claude setup between machines, and the shortcuts
 * for when the panel is not enough (the raw settings file, Claude Code's own
 * /config, this extension's settings, a diagnostics report).
 *
 * The webview only fires host commands; file dialogs, zip work and editors
 * all run host-side.
 */
import { Button, Section } from "../../../../../webview/shared/ui";
import type { ConfigApi } from "../../api";
import { isSectionCollapsed, toggleSection } from "../../model";

export interface BackupViewProps {
  api: ConfigApi;
}

export function BackupView({ api }: BackupViewProps) {
  return (
    <Section
      id="backup"
      title="Backup & tools"
      collapsed={isSectionCollapsed("backup")}
      onToggle={toggleSection}
    >
      {/* What a brain holds, and what it never does: the privacy half is the
          reason this line stays on screen rather than behind an InfoTip. */}
      <div class="field-hint">
        One <code>.claudebrain.zip</code> with your skills, commands, agents, memory, hooks and MCP
        servers. Sessions and credentials are never included.
      </div>
      <div class="actions-row">
        <Button iconName="upload" onClick={() => api.runCommand("claudeManager.exportBrain")}>
          Export brain…
        </Button>
        <Button iconName="download" onClick={() => api.runCommand("claudeManager.importBrain")}>
          Import brain…
        </Button>
      </div>
      <div class="actions-row">
        <Button iconName="external-link" onClick={() => api.openSettingsFile("global")}>
          Open settings.json
        </Button>
        <Button iconName="terminal" onClick={() => api.launchSlash("/config")}>
          Open /config
        </Button>
        <Button
          iconName="settings"
          title="Open VS Code settings filtered to Claude Code Manager"
          onClick={() => api.openExtensionSettings()}
        >
          Extension settings
        </Button>
        <Button
          iconName="info"
          title="Open a report covering the CLI, file health, hook paths and versions"
          onClick={() => api.runCommand("claudeManager.runDiagnostics")}
        >
          Run diagnostics
        </Button>
      </div>
    </Section>
  );
}
