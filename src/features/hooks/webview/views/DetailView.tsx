/**
 * Hook detail view — full event / matcher / command / scope plus actions.
 * Editable scopes (global / project / local) get edit, toggle, delete, and
 * open-settings-file actions; plugin hooks are read-only (their declaration
 * lives in plugin.json) so only copy + a read-only note are shown.
 */
import { useState } from "preact/hooks";
import { Button } from "../../../../webview/components/Button";
import { Icon } from "../../../../webview/components/Icon";
import { cx } from "../../../../webview/utils/classnames";
import { useApi } from "../../../../webview/hooks/useApi";
import type { Hook } from "../../types";
import * as api from "../api";
import type { Post } from "../api";
import { eventLabel, matcherDisplay, scopeLabel } from "../events";
import { selectedHook } from "../signals";
import { EditForm } from "../components/EditForm";

export interface DetailViewProps {
  hook: Hook;
}

export function DetailView({ hook }: DetailViewProps) {
  const { post } = useApi();
  const send = post as Post;
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const isPlugin = hook.scope === "plugin";
  const eLabel = eventLabel(hook.event);
  const sLabel = scopeLabel(hook);
  const mDisplay = matcherDisplay(hook.matcher);

  const back = (): void => {
    selectedHook.value = null;
  };

  const copy = (): void => {
    navigator.clipboard?.writeText(hook.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div class="panel hooks-panel">
      <button type="button" class="back-btn" onClick={back}>
        <Icon name="arrow-left" /> Back
      </button>

      <div class="d-head">
        <div class="d-title">{eLabel}</div>
        <div class="d-tags">
          <span class={cx("scope-badge", hook.scope)} title={sLabel}>
            {sLabel}
          </span>
          <span class="tag">{`matcher: ${mDisplay}`}</span>
          {hook.disabled ? <span class="hook-disabled-badge">disabled</span> : null}
        </div>
      </div>

      <div class="d-actions">
        <Button variant="primary" onClick={copy}>
          <Icon name="copy" /> {copied ? "Copied!" : "Copy command"}
        </Button>
        {isPlugin ? (
          <span class="hook-readonly-note">
            {`Owned by plugin ${hook.pluginName ?? ""} — manage via Claude Code's /plugin.`}
          </span>
        ) : (
          <>
            <Button onClick={() => setEditing(true)}>
              <Icon name="pencil" /> Edit
            </Button>
            <Button onClick={() => api.toggleHookEnabled(send, hook)}>
              <Icon name={hook.disabled ? "play" : "pin-off"} />{" "}
              {hook.disabled ? "Enable" : "Disable"}
            </Button>
            <Button
              onClick={() => {
                // Narrowed away from "plugin" by the !isPlugin branch, but
                // TS can't follow that through the boolean — guard here so
                // openSettingsFile keeps its SettingsScope contract.
                if (hook.scope !== "plugin") api.openSettingsFile(send, hook.scope);
              }}
            >
              <Icon name="external-link" /> Open settings file
            </Button>
            <Button class="del" onClick={() => api.deleteHook(send, hook)}>
              <Icon name="trash-2" /> Delete
            </Button>
          </>
        )}
      </div>

      <div class="d-scroll">
        {editing && !isPlugin ? (
          <EditForm
            hook={hook}
            onCancel={() => setEditing(false)}
            onSave={(next) => {
              api.updateHook(send, hook, next);
              setEditing(false);
            }}
          />
        ) : (
          <>
            <div class="d-section">
              <div class="d-label">Event</div>
              <div class="d-kv">
                <span class="d-k">Type</span>
                <span class="d-v">{eLabel}</span>
              </div>
              <div class="d-kv">
                <span class="d-k">Matcher</span>
                <span class="d-v mono">{mDisplay}</span>
              </div>
              <div class="d-kv">
                <span class="d-k">Scope</span>
                <span class="d-v">{sLabel}</span>
              </div>
            </div>
            <div class="d-section">
              <div class="d-label">Command</div>
              <pre class="hook-command-block">
                <code>{hook.command}</code>
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
