/**
 * Permissions section of the Config tab — the scope toggle (global /
 * project / local), a live search box, the allow/deny tool lists, and the
 * additional-directories list. Scope + search are config-local signals;
 * the actual allow/deny/dir mutations round-trip through the host (which
 * confirms removals natively) and come back as a fresh `accountData`.
 */
import { Icon } from "../../../../webview/shared/ui";
import type { AccountData, PermissionScope, PermissionSet, PermissionList } from "../../types";
import type { ConfigApi } from "../api";

export interface PermissionsViewProps {
  data: AccountData;
  api: ConfigApi;
  scope: PermissionScope;
  search: string;
  onScopeChange: (scope: PermissionScope) => void;
  onSearchChange: (q: string) => void;
}

export function PermissionsView({
  data,
  api,
  scope,
  search,
  onScopeChange,
  onSearchChange,
}: PermissionsViewProps) {
  const set = data.permissions.find((p) => p.scope === scope);
  const hasProjectScope = data.permissions.some((p) => p.scope === "project");
  const query = search.trim().toLowerCase();

  return (
    <section class="acct-section">
      <header class="acct-section-header" data-section="permissions">
        <h2 class="acct-section-title">
          <Icon name="shield" size={14} /> Permissions
        </h2>
      </header>
      <div class="acct-section-body">
        <div class="vs-segmented acct-scope-toggle" role="tablist">
          <button
            class={`vs-segmented-btn ${scope === "global" ? "active" : ""}`}
            role="tab"
            onClick={() => onScopeChange("global")}
          >
            Global
          </button>
          {hasProjectScope ? (
            <button
              class={`vs-segmented-btn ${scope === "project" ? "active" : ""}`}
              role="tab"
              onClick={() => onScopeChange("project")}
            >
              Project
            </button>
          ) : null}
          {hasProjectScope ? (
            <button
              class={`vs-segmented-btn ${scope === "local" ? "active" : ""}`}
              role="tab"
              onClick={() => onScopeChange("local")}
            >
              Local
            </button>
          ) : null}
        </div>

        <div class="acct-field">
          <input
            type="text"
            class="acct-input"
            id="cfg-perm-search"
            value={search}
            placeholder="Search tools..."
            onInput={(e) => onSearchChange((e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <PermissionList set={set} scope={scope} list="allow" label="Allowed" query={query} api={api} />
        <PermissionList set={set} scope={scope} list="deny" label="Denied" query={query} api={api} />

        <AdditionalDirectories dirs={data.settings.additionalDirectories} api={api} />

        <div class="acct-field-hint">
          Pattern format: <code>Bash(command:*)</code>, <code>Read(path/**)</code>,{" "}
          <code>mcp__server__*</code>. Wildcards only inside the parens; a bare tool name (e.g.{" "}
          <code>Bash</code>) matches ALL invocations.
        </div>

        <div class="acct-actions">
          <button class="btn" id="cfg-add-allow" onClick={() => api.promptAddPermission(scope, "allow")}>
            <Icon name="plus" size={14} /> Add allowed
          </button>
          <button class="btn" id="cfg-add-deny" onClick={() => api.promptAddPermission(scope, "deny")}>
            <Icon name="x" size={14} /> Add denied
          </button>
          <button class="btn" id="cfg-open-perms" onClick={() => api.openSettingsFile(scope)}>
            <Icon name="external-link" size={14} /> Edit in file
          </button>
        </div>
      </div>
    </section>
  );
}

interface PermissionListProps {
  set: PermissionSet | undefined;
  scope: PermissionScope;
  list: PermissionList;
  label: string;
  query: string;
  api: ConfigApi;
}

function PermissionList({ set, scope, list, label, query, api }: PermissionListProps) {
  const all = set?.[list] ?? [];
  const items = all.filter((t) => !query || t.toLowerCase().includes(query));
  const total = all.length;

  if (items.length === 0) {
    const empty =
      total > 0
        ? `No ${list === "allow" ? "allowed" : "denied"} tools match "${query}"`
        : `No ${list === "allow" ? "allowed" : "denied"} tools`;
    return (
      <div class="acct-perm-group">
        <div class="acct-perm-group-label">
          {label}
          {total > 0 ? ` (0 / ${total})` : ""}
        </div>
        <div class="acct-empty-small">{empty}</div>
      </div>
    );
  }

  const countLabel = query ? `${items.length} / ${total}` : `${items.length}`;
  return (
    <div class="acct-perm-group">
      <div class="acct-perm-group-label">
        {label} ({countLabel})
      </div>
      {items.map((t) => (
        <div class="acct-perm-row" key={t}>
          <span class="acct-perm-name">{t}</span>
          <button
            class="acct-perm-remove"
            title="Remove"
            onClick={() => api.promptRemovePermission(scope, t, list)}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

interface AdditionalDirectoriesProps {
  dirs: string[];
  api: ConfigApi;
}

function AdditionalDirectories({ dirs, api }: AdditionalDirectoriesProps) {
  return (
    <div class="acct-perm-group">
      <div class="acct-perm-group-label">
        Additional directories{dirs.length > 0 ? ` (${dirs.length})` : ""}
      </div>
      {dirs.length === 0 ? (
        <div class="acct-empty-small">None — Claude can only read the workspace.</div>
      ) : (
        dirs.map((d) => (
          <div class="acct-perm-row" key={d}>
            <span class="acct-perm-name">{d}</span>
            <button
              class="acct-perm-remove"
              title="Remove"
              onClick={() =>
                api.setSetting(
                  "permissions.additionalDirectories",
                  dirs.filter((x) => x !== d),
                )
              }
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ))
      )}
      <div class="acct-actions">
        <button class="btn" id="cfg-add-dir" onClick={() => api.promptAddDirectory()}>
          <Icon name="plus" size={14} /> Add directory
        </button>
      </div>
    </div>
  );
}
