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
import { SCOPE_LABEL, scopeTone } from "../../lib";

export interface PolicyListProps {
  entries: PluginPolicyEntry[];
}

/** The key's value, spelled the way a settings file would. */
function valueText(value: string[] | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return value.length === 0 ? "(empty list)" : value.join(", ");
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
              variant={entry.ignored ? "danger" : undefined}
              scope={entry.ignored ? undefined : scopeTone(entry.scope)}
              title={`Set in ${SCOPE_LABEL[entry.scope]} settings`}
            />
          </div>
          <div class="plg-item-detail">{valueText(entry.value)}</div>
          {entry.ignored ? (
            <div class="plg-item-warning" role="note">
              Claude Code honours this key in managed settings only, so the value set here has
              no effect.
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
