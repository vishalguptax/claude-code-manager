/**
 * The plugin-related settings keys that are not the `enabledPlugins` map:
 * marketplace allow/block lists, hook ordering, the claude.ai sync switches.
 *
 * Each row states the scope that set the key, because several of these are
 * honoured from managed settings ONLY. A key set anywhere else is inert, and
 * saying so is the whole reason this block exists — there is no other
 * surface, in Claude Code or here, that tells you your allowlist is being
 * ignored.
 */
import { Badge } from "../../../../../webview/shared/ui";
import type { PluginPolicyEntry } from "../../../types";
import { SCOPE_LABEL } from "../../lib";

export interface PolicyListProps {
  entries: PluginPolicyEntry[];
}

export function PolicyList({ entries }: PolicyListProps) {
  if (entries.length === 0) return null;
  return (
    <div class="plg-policy">
      {entries.map((entry) => (
        <div class="plg-policy-row" key={entry.key}>
          <div class="plg-item-row1">
            <span class="plg-policy-key">{entry.key}</span>
            <Badge
              text={SCOPE_LABEL[entry.scope]}
              variant={entry.ignored ? "danger" : "default"}
              title={`Set in ${SCOPE_LABEL[entry.scope]} settings`}
            />
          </div>
          <div class="plg-item-detail">
            {typeof entry.value === "boolean"
              ? entry.value
                ? "true"
                : "false"
              : entry.value.length === 0
                ? "(empty list)"
                : entry.value.join(", ")}
          </div>
          {entry.ignored ? (
            <div class="plg-item-warning" role="note">
              Claude Code reads <code>{entry.key}</code> from managed settings only, so this
              value has no effect.
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
