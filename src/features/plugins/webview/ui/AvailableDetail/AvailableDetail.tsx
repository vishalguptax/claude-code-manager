/**
 * Install view for one plugin a marketplace offers.
 *
 * Same shell as the installed plugin's DetailView — `.panel`, BackButton,
 * `.d-head`, `.d-actions`, `.d-section` — so the two read as one object
 * before and after installing.
 *
 * Installing hands off to `claude plugin install` in a terminal (see the
 * host's `installPluginCommand`), so the view cannot know when it finishes.
 * It says so after the click, and needs no polling: the host watches Claude
 * Code's install registry, and the fresh snapshot flips this view to its
 * installed state on its own.
 */
import { useState } from "preact/hooks";
import {
  BackButton,
  Badge,
  Button,
  Segmented,
} from "../../../../../webview/shared/ui";
import type { AvailablePlugin, PluginInstallScope } from "../../../types";
import { INSTALL_SCOPES } from "../../lib";
import { Fact } from "../Fact";

export interface AvailableDetailProps {
  plugin: AvailablePlugin;
  onBack: () => void;
  onInstall: (id: string, scope: PluginInstallScope) => void;
  /** Open the installed plugin's own detail view. */
  onShowInstalled: (id: string) => void;
  onOpenUrl: (url: string) => void;
  onCopyId: (id: string) => void;
}

export function AvailableDetail({
  plugin,
  onBack,
  onInstall,
  onShowInstalled,
  onOpenUrl,
  onCopyId,
}: AvailableDetailProps) {
  const [scope, setScope] = useState<PluginInstallScope>("user");
  const [requested, setRequested] = useState(false);
  const explain = INSTALL_SCOPES.find((s) => s.value === scope)?.explain ?? "";

  return (
    <div class="panel" id="pluginsAvailableView">
      <BackButton onClick={onBack} label="Browse plugins" />

      {/* Title, description, then chips — the Memory detail's head, which is
          the one shared head that carries a description. The marketplace is
          not a chip: names run long enough to be clipped there, and the
          Plugin section below already states it in full. */}
      <div class="d-head">
        <div class="d-title">{plugin.name}</div>
        {plugin.description === "" ? null : (
          <div class="d-subtitle">{plugin.description}</div>
        )}
        {plugin.installed ? (
          <div class="d-tags">
            <Badge text="installed" variant="status" />
          </div>
        ) : null}
      </div>

      <div class="d-actions">
        {plugin.installed ? (
          <Button variant="primary" iconName="package" onClick={() => onShowInstalled(plugin.id)}>
            Show installed
          </Button>
        ) : (
          <Button
            variant="primary"
            iconName="download"
            onClick={() => {
              setRequested(true);
              onInstall(plugin.id, scope);
            }}
          >
            Install
          </Button>
        )}
        {plugin.homepage === "" ? null : (
          <Button iconName="external-link" onClick={() => onOpenUrl(plugin.homepage)}>
            Homepage
          </Button>
        )}
        <Button iconName="copy" onClick={() => onCopyId(plugin.id)}>
          Copy id
        </Button>
      </div>

      {requested && !plugin.installed ? (
        <div class="plg-note" role="status">
          Finish in the terminal. This view updates once Claude Code records the install.
        </div>
      ) : null}

      {plugin.installed ? null : (
        <div class="d-section">
          <div class="d-label">Install for</div>
          <Segmented<PluginInstallScope>
            value={scope}
            options={INSTALL_SCOPES.map(({ value, label }) => ({ value, label }))}
            onChange={setScope}
            ariaLabel="Install scope"
          />
          <div class="plg-item-detail plg-install-explain">{explain}</div>
        </div>
      )}

      <div class="d-section">
        <div class="d-label">Plugin</div>
        <Fact k="Id" value={plugin.id} />
        <Fact k="From" value={plugin.marketplace} />
        <Fact k="Category" value={plugin.category} />
        <Fact k="Author" value={plugin.author} />
      </div>
    </div>
  );
}
