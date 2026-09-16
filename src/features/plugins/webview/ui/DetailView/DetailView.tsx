/**
 * Detail view for one plugin: the state chips, the actions, the install facts
 * a row has no room for, and the full override chain.
 *
 * Same shell as the MCP and Skills detail views — a `.panel` root, the shared
 * `<BackButton>`, a `.d-head--row` title line, a `.d-actions` toolbar, and
 * `.d-section` blocks of key/value rows — so drilling into a plugin feels
 * like drilling into anything else in the sidebar.
 */
import {
  BackButton,
  Badge,
  Button,
  Tag,
} from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import type { PluginEntry, PluginSettingsScope } from "../../../types";
import {
  canToggle,
  EDITABLE_SCOPES,
  overrideSteps,
  readOnlyReason,
  SCOPE_LABEL,
  scopeTone,
  stateSummary,
  STATUS_LABEL,
  statusVariant,
} from "../../lib";

export interface DetailViewProps {
  plugin: PluginEntry;
  onBack: () => void;
  onToggle: (plugin: PluginEntry) => void;
  onOpenDirectory: (id: string) => void;
  onCopyId: (id: string) => void;
  onOpenSettings: (scope: PluginSettingsScope) => void;
}

/** One labelled fact. Skipped entirely when the parser had no value for it. */
function Fact({ k, value }: { k: string; value: string }) {
  if (value === "") return null;
  return (
    <div class="d-kv">
      <span class="d-k">{k}</span>
      <span class="d-v" title={value}>
        {value}
      </span>
    </div>
  );
}

export function DetailView({
  plugin,
  onBack,
  onToggle,
  onOpenDirectory,
  onCopyId,
  onOpenSettings,
}: DetailViewProps) {
  const steps = overrideSteps(plugin);
  const toggleable = canToggle(plugin);
  const reason = readOnlyReason(plugin);
  const scope = plugin.decidedBy;
  const config = plugin.config;

  return (
    <div class="panel" id="pluginsDetailView">
      <BackButton onClick={onBack} />

      <div class="d-head d-head--row">
        <div class="d-title">{plugin.name}</div>
        <Badge text={STATUS_LABEL[plugin.status]} variant={statusVariant(plugin.status)} />
        {scope ? <Badge text={SCOPE_LABEL[scope]} scope={scopeTone(scope)} /> : null}
      </div>

      <div class="d-actions">
        {toggleable ? (
          <Button
            variant="primary"
            iconName={plugin.enabled ? "eye-off" : "eye"}
            onClick={() => onToggle(plugin)}
          >
            {plugin.enabled ? "Disable" : "Enable"}
          </Button>
        ) : null}
        {plugin.installed ? (
          <Button iconName="folder" onClick={() => onOpenDirectory(plugin.id)}>
            Open folder
          </Button>
        ) : null}
        <Button iconName="copy" onClick={() => onCopyId(plugin.id)}>
          Copy id
        </Button>
      </div>

      {/* Quiet, in-flow explanation of a missing control — the same treatment
          the Hooks and MCP detail views give a read-only item. */}
      {reason === "" ? null : (
        <div class="plg-note" role="note">
          {reason}
        </div>
      )}

      <div class="d-section">
        <div class="d-label">Plugin</div>
        <Fact k="Id" value={plugin.id} />
        <Fact k="From" value={plugin.marketplace} />
        <Fact k="Version" value={plugin.version} />
        <Fact k="Install" value={plugin.installPath} />
        <Fact k="Scope" value={plugin.installScope} />
        {plugin.description === "" ? null : (
          <div class="plg-item-detail">{plugin.description}</div>
        )}
      </div>

      <div class="d-section">
        <div class="d-label">Enablement</div>
        <div class="plg-item-detail">{stateSummary(plugin)}</div>
        {steps.length === 0 ? null : (
          <div class="plg-item-chain" title="Settings precedence, lowest first">
            {steps.map((step) => (
              <Tag
                key={step.scope}
                text={`${step.scope}: ${step.state}`}
                class={cx("plg-chain-tag", step.winner && "is-winner")}
              />
            ))}
          </div>
        )}
      </div>

      <div class="d-section">
        <div class="d-label">Settings files</div>
        {/* Every file, not just the winning one: an override is only fixable
            from the file that set it. */}
        <div class="plg-detail-scopes">
          {EDITABLE_SCOPES.map((s) => (
            <Button
              key={s}
              variant="outline"
              iconName="settings"
              title={`Open ${SCOPE_LABEL[s]} settings.json`}
              onClick={() => onOpenSettings(s)}
            >
              {SCOPE_LABEL[s]}
            </Button>
          ))}
        </div>
      </div>

      {config === null ? null : (
        <div class="d-section">
          <div class="d-label">Configuration</div>
          <pre class="d-pre">{JSON.stringify(config, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
