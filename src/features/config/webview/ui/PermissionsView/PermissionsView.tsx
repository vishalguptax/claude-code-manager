/**
 * Permissions section of the Config tab: everything that decides what Claude
 * may do, in one place.
 *
 * Two layers, top to bottom. First the global mode and the two safety
 * switches (they used to sit in a separate Settings group, far from the rules
 * they interact with). Then the rules themselves, per scope: the scope filter,
 * the allow / deny / additional-directory lists, each with its own add button
 * in its heading. The search box appears only once there are enough rules to
 * need it.
 *
 * Scope + search are config-local signals; every mutation round-trips through
 * the host (which confirms removals natively) and comes back as a fresh
 * `accountData`.
 */
import { useState } from "preact/hooks";
import {
  Badge,
  Button,
  ScopeFilter,
  SearchInput,
  Section,
  ShowMore,
} from "../../../../../webview/shared/ui";
import type {
  AccountData,
  PermissionList,
  PermissionScope,
  PermissionSet,
} from "../../../types";
import type { ConfigApi } from "../../api";
import { DEFAULT_MODE_OPTIONS } from "../../lib";
import { isSectionCollapsed, toggleSection } from "../../model";
import { SelectField, ToggleField } from "../SettingFields";

export interface PermissionsViewProps {
  data: AccountData;
  api: ConfigApi;
  scope: PermissionScope;
  search: string;
  onScopeChange: (scope: PermissionScope) => void;
  onSearchChange: (q: string) => void;
}

/** Patterns shown per list before the rest is disclosed. See PermissionList. */
const PERMISSIONS_TOP_DEFAULT = 6;

export function PermissionsView({
  data,
  api,
  scope,
  search,
  onScopeChange,
  onSearchChange,
}: PermissionsViewProps) {
  const s = data.settings;
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
  const ruleCount = (set?.allow.length ?? 0) + (set?.deny.length ?? 0);
  // A search box over a handful of rules is a control with nothing to do.
  // Kept while a query is active so it can be cleared.
  const showSearch = ruleCount > PERMISSIONS_TOP_DEFAULT || query !== "";
  const modeDesc = (
    DEFAULT_MODE_OPTIONS.find((o) => o.value === s.defaultMode) ?? DEFAULT_MODE_OPTIONS[0]
  ).desc;

  const scopeOptions: Array<{ value: PermissionScope; label: string }> = [
    { value: "global", label: "Global" },
  ];
  if (hasProjectScope) {
    scopeOptions.push({ value: "project", label: "Project" });
    scopeOptions.push({ value: "local", label: "Local" });
  }

  return (
    <Section
      id="permissions"
      title="Permissions"
      collapsed={isSectionCollapsed("permissions")}
      onToggle={toggleSection}
      headerActions={
        <Button
          variant="icon"
          iconName="external-link"
          title={`Open the ${scope} settings.json`}
          ariaLabel={`Open the ${scope} settings.json`}
          onClick={(e) => {
            // The header itself collapses the section.
            e.stopPropagation();
            api.openSettingsFile(scope);
          }}
        />
      }
    >
      <SelectField
        label="Tool-use confirmation"
        info={modeDesc}
        value={s.defaultMode}
        options={DEFAULT_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(v) => api.setSetting("permissions.defaultMode", v)}
      />
      <ToggleField
        label="Sandbox Bash commands"
        info="Runs shell commands isolated from your files and network. macOS, Linux and WSL2."
        checked={s.sandboxEnabled}
        onChange={(c) => api.setSetting("sandbox.enabled", c ? true : "")}
      />
      <ToggleField
        label="Block bypass-permissions mode"
        info="Stops any session from switching to the mode that skips every prompt."
        checked={s.disableBypassPermissionsMode}
        onChange={(c) => api.setSetting("permissions.disableBypassPermissionsMode", c ? true : "")}
      />

      <div class="cfg-rules">
        <ScopeFilter<PermissionScope>
          value={scope}
          options={scopeOptions}
          onChange={onScopeChange}
        />
        {showSearch ? (
          <div class="field">
            <SearchInput
              value={search}
              placeholder="Search rules"
              ariaLabel="Search permission rules"
              onInput={onSearchChange}
            />
          </div>
        ) : null}

        <PermissionList set={set} scope={scope} list="allow" label="Allowed" query={query} api={api} />
        <PermissionList set={set} scope={scope} list="deny" label="Denied" query={query} api={api} />
        <AdditionalDirectories dirs={s.additionalDirectories ?? []} api={api} />
      </div>
    </Section>
  );
}

/**
 * A list heading: its name, its count, and the button that adds to it. The add
 * button sits with the list it adds to, not in a row of actions below every
 * list where "Add denied" was a scroll away from the denied rules.
 */
function GroupHead({
  label,
  count,
  addLabel,
  onAdd,
}: {
  label: string;
  count: string | null;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div class="cfg-perm-group-label">
      <span>{label}</span>
      {count === null ? null : <Badge text={count} variant="count" />}
      <Button
        variant="icon"
        iconName="plus"
        class="cfg-perm-add"
        title={addLabel}
        ariaLabel={addLabel}
        onClick={onAdd}
      />
    </div>
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

/**
 * One allow or deny list. Shows the first {@link PERMISSIONS_TOP_DEFAULT}
 * patterns and discloses the rest: a real global allow-list runs to sixty-odd
 * entries, one per row, which pushed every section below past three
 * screenfuls of scrolling.
 */
function PermissionList({ set, scope, list, label, query, api }: PermissionListProps) {
  const [expanded, setExpanded] = useState(false);
  const all = set?.[list] ?? [];
  const items = all.filter((t) => !query || t.toLowerCase().includes(query));
  const total = all.length;
  // A search is already a narrowing, so it shows everything it matched rather
  // than hiding results behind a second disclosure.
  const collapsed = !expanded && !query;
  const visible = collapsed ? items.slice(0, PERMISSIONS_TOP_DEFAULT) : items;

  const noun = list === "allow" ? "allowed" : "denied";
  const head = (count: string | null) => (
    <GroupHead
      label={label}
      count={count}
      addLabel={`Add ${noun} tool`}
      onAdd={() => api.promptAddPermission(scope, list)}
    />
  );

  if (items.length === 0) {
    const empty = total > 0 ? `No ${noun} tools match "${query}"` : `No ${noun} tools`;
    return (
      <div class="cfg-perm-group">
        {head(total > 0 ? `0 / ${total}` : null)}
        <div class="cfg-note">{empty}</div>
      </div>
    );
  }

  return (
    <div class="cfg-perm-group">
      {head(query ? `${items.length} / ${total}` : `${items.length}`)}
      {visible.map((t) => (
        <div class="cfg-perm-row" key={t}>
          <span class="cfg-perm-name">{t}</span>
          <Button
            variant="icon"
            iconName="x"
            class="cfg-perm-remove"
            title="Remove"
            ariaLabel={`Remove ${t}`}
            onClick={() => api.promptRemovePermission(scope, t, list)}
          />
        </div>
      ))}
      {query ? null : (
        <ShowMore
          total={items.length}
          threshold={PERMISSIONS_TOP_DEFAULT}
          expanded={expanded}
          onToggle={setExpanded}
          noun="patterns"
        />
      )}
    </div>
  );
}

interface AdditionalDirectoriesProps {
  dirs: string[];
  api: ConfigApi;
}

function AdditionalDirectories({ dirs, api }: AdditionalDirectoriesProps) {
  return (
    <div class="cfg-perm-group">
      <GroupHead
        label="Additional directories"
        count={dirs.length > 0 ? String(dirs.length) : null}
        addLabel="Add directory"
        onAdd={() => api.promptAddDirectory()}
      />
      {dirs.length === 0 ? (
        <div class="cfg-note">None. Claude can only read the workspace.</div>
      ) : (
        dirs.map((d) => (
          <div class="cfg-perm-row" key={d}>
            <span class="cfg-perm-name">{d}</span>
            <Button
              variant="icon"
              iconName="x"
              class="cfg-perm-remove"
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
    </div>
  );
}
