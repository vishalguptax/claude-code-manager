/**
 * Hook detail view — full event / matcher / command / scope plus actions.
 * Editable scopes (global / project / local) get edit, toggle, delete, and
 * open-settings-file actions; plugin hooks are read-only (their declaration
 * lives in plugin.json) so only copy + a read-only note are shown.
 */
import { useState } from "preact/hooks";
import { BackButton, Badge, Button, Icon } from "../../../../../webview/shared/ui";
import { useApi, useCopyFeedback } from "../../../../../webview/shared/hooks";
import type { Hook } from "../../../types";
import * as api from "../../api";
import type { Post } from "../../api";
import { eventLabel, matcherDisplay, scopeLabel } from "../../lib";
import { eventUsesMatcher } from "../../../events";
import { selectedHook } from "../../model";
import { EditForm } from "../EditForm";

export interface DetailViewProps {
  hook: Hook;
}

export function DetailView({ hook }: DetailViewProps) {
  const { post } = useApi();
  const send = post as Post;
  const [editing, setEditing] = useState(false);
  const { copied, copy: copyText } = useCopyFeedback();

  const isPlugin = hook.scope === "plugin";
  const isCommand = hook.hookType === "command";
  const eLabel = eventLabel(hook.event);
  const sLabel = scopeLabel(hook);
  const mDisplay = matcherDisplay(hook.matcher);

  const back = (): void => {
    selectedHook.value = null;
  };

  const copy = (): void => copyText(hook.command);

  return (
    <div class="panel hooks-panel">
      <BackButton onClick={back} />

      <div class="d-head">
        <div class="d-title">{eLabel}</div>
        <div class="d-tags">
          <Badge variant="scope" text={sLabel} title={sLabel} />
          {eventUsesMatcher(hook.event) ? (
            <Badge variant="default" text={`matcher: ${mDisplay}`} title={mDisplay} />
          ) : null}
          {!isCommand ? <Badge variant="default" text={hook.hookType} /> : null}
          {hook.disabled ? <Badge variant="status" text="disabled" /> : null}
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
            {isCommand ? (
              <Button onClick={() => setEditing(true)}>
                <Icon name="pencil" /> Edit
              </Button>
            ) : null}
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
            <Button variant="danger" onClick={() => api.deleteHook(send, hook)}>
              <Icon name="trash-2" /> Delete
            </Button>
          </>
        )}
        <Button onClick={() => api.openHooksPanel(send)} title="Open Claude's /hooks panel">
          <Icon name="terminal" /> Open /hooks
        </Button>
      </div>

      <div class="d-scroll">
        {editing && !isPlugin && isCommand ? (
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
              {!isCommand ? (
                <div class="d-kv">
                  <span class="d-k">Action</span>
                  <span class="d-v">{hook.hookType}</span>
                </div>
              ) : null}
              {hook.timeout !== undefined ? (
                <div class="d-kv">
                  <span class="d-k">Timeout</span>
                  <span class="d-v">{`${hook.timeout}s`}</span>
                </div>
              ) : null}
            </div>
            <div class="d-section">
              <div class="d-label">{isCommand ? "Command" : "Content"}</div>
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
