/**
 * Permissions section of the Config tab — the scope filter (global /
 * project / local), a live search box, the allow/deny tool lists, and the
 * additional-directories list. Scope + search are config-local signals;
 * the actual allow/deny/dir mutations round-trip through the host (which
 * confirms removals natively) and come back as a fresh `accountData`.
 *
 * Shared components: the scope segments use <ScopeFilter>, the live filter
 * uses <SearchInput>, group counts render as <Badge>, the action row uses
 * <Button>, and per-row removals use an icon <Button>.
 */
import {
  Badge,
  Button,
  Icon,
  ScopeFilter,
  SearchInput,
} from "../../../../../webview/shared/ui";
import type {
  AccountData,
  PermissionList,
  PermissionScope,
  PermissionSet,
} from "../../../types";
import type { ConfigApi } from "../../api";

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
  // Defensive defaults: `accountData` crosses the host boundary as `unknown`
  // and is cast to AccountData, so a partial/legacy payload (or an early render
  // before the full parse) could omit `permissions`. Reading `.find` straight
  // off an undefined array throws, which makes Preact blank the ENTIRE
  // Permissions section — i.e. the view renders empty even though the scope
  // genuinely has data. Falling back to an empty array keeps the section alive
  // and lets the per-list empty states render correctly instead.
  const permissions = data.permissions ?? [];
  const set = permissions.find((p) => p.scope === scope);
  const hasProjectScope = permissions.some((p) => p.scope === "project");
  const query = search.trim().toLowerCase();

  const scopeOptions: Array<{ value: PermissionScope; label: string }> = [
    { value: "global", label: "Global" },
  ];
  if (hasProjectScope) {
    scopeOptions.push({ value: "project", label: "Project" });
    scopeOptions.push({ value: "local", label: "Local" });
  }

  return (
    <section class="acct-section">
      <header class="acct-section-header" data-section="permissions">
        <h2 class="acct-section-title">
          <Icon name="shield" size={14} /> Permissions
        </h2>
      </header>
      <div class="acct-section-body">
        <ScopeFilter<PermissionScope>
          class="acct-scope-toggle"
          value={scope}
          options={scopeOptions}
          onChange={onScopeChange}
        />

        <div class="acct-field">
          <SearchInput
            value={search}
            placeholder="Search tools..."
            ariaLabel="Search tools"
            onInput={onSearchChange}
          />
        </div>

        <PermissionList set={set} scope={scope} list="allow" label="Allowed" query={query} api={api} />
        <PermissionList set={set} scope={scope} list="deny" label="Denied" query={query} api={api} />

        <AdditionalDirectories dirs={data.settings?.additionalDirectories ?? []} api={api} />

        <div class="acct-field-hint">
          Pattern format: <code>Bash(command:*)</code>, <code>Read(path/**)</code>,{" "}
          <code>mcp__server__*</code>. Wildcards only inside the parens; a bare tool name (e.g.{" "}
          <code>Bash</code>) matches ALL invocations.
        </div>

        <div class="acct-actions">
          <Button iconName="plus" onClick={() => api.promptAddPermission(scope, "allow")}>
            Add allowed
          </Button>
          <Button iconName="x" onClick={() => api.promptAddPermission(scope, "deny")}>
            Add denied
          </Button>
          <Button iconName="external-link" onClick={() => api.openSettingsFile(scope)}>
            Edit in file
          </Button>
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
          {total > 0 ? <Badge text={`0 / ${total}`} variant="count" /> : null}
        </div>
        <div class="acct-empty-small">{empty}</div>
      </div>
    );
  }

  const countLabel = query ? `${items.length} / ${total}` : `${items.length}`;
  return (
    <div class="acct-perm-group">
      <div class="acct-perm-group-label">
        {label} <Badge text={countLabel} variant="count" />
      </div>
      {items.map((t) => (
        <div class="acct-perm-row" key={t}>
          <span class="acct-perm-name">{t}</span>
          <Button
            variant="icon"
            iconName="x"
            class="acct-perm-remove"
            title="Remove"
            ariaLabel={`Remove ${t}`}
            onClick={() => api.promptRemovePermission(scope, t, list)}
          />
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
        Additional directories{dirs.length > 0 ? <Badge text={String(dirs.length)} variant="count" /> : null}
      </div>
      {dirs.length === 0 ? (
        <div class="acct-empty-small">None — Claude can only read the workspace.</div>
      ) : (
        dirs.map((d) => (
          <div class="acct-perm-row" key={d}>
            <span class="acct-perm-name">{d}</span>
            <Button
              variant="icon"
              iconName="x"
              class="acct-perm-remove"
              title="Remove"
              ariaLabel={`Remove ${d}`}
              onClick={() =>
                api.setSetting(
                  "permissions.additionalDirectories",
                  dirs.filter((x) => x !== d),
                )
              }
            />
          </div>
        ))
      )}
      <div class="acct-actions">
        <Button iconName="plus" onClick={() => api.promptAddDirectory()}>
          Add directory
        </Button>
      </div>
    </div>
  );
}
