/**
 * Skills list view: search row, scope filter, and the grouped skill list.
 * Reads feature signals directly; writes search/scope/selection back to
 * them. Lists longer than the virtualization threshold render through the
 * shared <VirtualList /> over a flattened row model.
 */
import { useRef } from "preact/hooks";
import { useApi } from "../../../../../webview/shared/hooks";
import {
  Button,
  ScopeFilter as ScopeFilterControl,
  type ScopeOption,
  SearchInput,
  VirtualList,
} from "../../../../../webview/shared/ui";
import type { Skill } from "../../../types";
import { getSkillDetail, getSkills, launchSkillInChat, openUrl } from "../../api";
import { groupSkills } from "../../lib";
import {
  claudeCodeInstalled,
  countByScope,
  filteredSkills,
  marketplaceSkillsUrl,
  type ScopeFilter,
  scopeFilter,
  searchQuery,
  selectedSkill,
  skills,
} from "../../model";
import { SkillItem } from "../SkillItem";

/** Above this count the list switches to windowed rendering. */
const VIRTUAL_THRESHOLD = 50;
/** Fixed row height (px) used only in virtualized mode. */
const VIRTUAL_ROW_HEIGHT = 84;

/** Flattened row model so headings and items share one virtualized list. */
type Row =
  | { kind: "count"; total: number }
  | { kind: "group"; label: string }
  | { kind: "subgroup"; folder: string }
  | { kind: "skill"; skill: Skill };

function buildRows(list: Skill[]): Row[] {
  const rows: Row[] = [{ kind: "count", total: list.length }];
  for (const bucket of groupSkills(list)) {
    rows.push({ kind: "group", label: bucket.label });
    for (const s of bucket.top) rows.push({ kind: "skill", skill: s });
    for (const { folder, skills: nested } of bucket.nested) {
      rows.push({ kind: "subgroup", folder });
      for (const s of nested) rows.push({ kind: "skill", skill: s });
    }
  }
  return rows;
}

/** Build the scope-filter options, hiding the Plugin segment when empty. */
function scopeOptions(total: number): ScopeOption<ScopeFilter>[] {
  const opts: ScopeOption<ScopeFilter>[] = [
    { value: "all", label: "All", count: total },
    { value: "project", label: "Project", count: countByScope("project") },
    { value: "global", label: "Global", count: countByScope("global") },
  ];
  const pluginCount = countByScope("plugin");
  if (pluginCount > 0) opts.push({ value: "plugin", label: "Plugin", count: pluginCount });
  return opts;
}

export function ListView() {
  const { post } = useApi();

  const list = filteredSkills.value;
  const total = skills.value.length;
  const selectedId = selectedSkill.value?.id;
  const chatEnabled = claudeCodeInstalled.value;

  function select(id: string): void {
    const skill = skills.value.find((s) => s.id === id);
    if (!skill) return;
    selectedSkill.value = skill;
    getSkillDetail(post, id);
  }

  function copy(name: string): void {
    navigator.clipboard?.writeText(`/${name}`);
  }

  const renderSkill = (skill: Skill) => (
    <SkillItem
      key={skill.id}
      skill={skill}
      active={selectedId === skill.id}
      chatEnabled={chatEnabled}
      onSelect={select}
      onCopy={copy}
      onLaunchChat={(name) => launchSkillInChat(post, name)}
    />
  );

  return (
    <div class="panel" id="skillsListView">
      <div class="search-row">
        <SearchInput
          value={searchQuery.value}
          onInput={(v) => {
            searchQuery.value = v.toLowerCase();
          }}
          placeholder="Search skills..."
          ariaLabel="Search skills"
          debounceMs={150}
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="globe"
          title="Browse community skills (opens externally)"
          ariaLabel="Browse community skills (opens externally)"
          onClick={() => openUrl(post, marketplaceSkillsUrl.value)}
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="refresh-cw"
          title="Refresh skills list"
          ariaLabel="Refresh skills list"
          onClick={() => getSkills(post)}
        />
      </div>

      {total > 0 ? (
        <ScopeFilterControl
          value={scopeFilter.value}
          options={scopeOptions(total)}
          onChange={(v) => {
            scopeFilter.value = v;
          }}
        />
      ) : null}

      <SkillList
        list={list}
        searching={searchQuery.value.length > 0}
        renderSkill={renderSkill}
        onBrowse={() => openUrl(post, marketplaceSkillsUrl.value)}
      />
    </div>
  );
}

interface SkillListProps {
  list: Skill[];
  searching: boolean;
  renderSkill: (skill: Skill) => preact.JSX.Element;
  onBrowse: () => void;
}

/** The grouped list body, with empty states and optional virtualization. */
function SkillList({ list, searching, renderSkill, onBrowse }: SkillListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (list.length === 0) {
    return (
      <div class="list" id="skillsList" ref={containerRef}>
        {searching ? (
          <div class="empty">No matching skills</div>
        ) : (
          <div class="empty">
            <div>No skills found</div>
            <Button variant="secondary" class="empty-link-btn" onClick={onBrowse}>
              Browse community skills →
            </Button>
          </div>
        )}
      </div>
    );
  }

  const rows = buildRows(list);

  if (list.length > VIRTUAL_THRESHOLD) {
    return (
      <VirtualList
        class="list"
        items={rows}
        itemHeight={VIRTUAL_ROW_HEIGHT}
        renderItem={(row) => <RowView row={row} renderSkill={renderSkill} />}
      />
    );
  }

  return (
    <div class="list" id="skillsList" ref={containerRef}>
      {rows.map((row, i) => (
        <RowView key={rowKey(row, i)} row={row} renderSkill={renderSkill} />
      ))}
    </div>
  );
}

function rowKey(row: Row, index: number): string {
  if (row.kind === "skill") return `s:${row.skill.id}`;
  if (row.kind === "group") return `g:${row.label}`;
  if (row.kind === "subgroup") return `f:${row.folder}:${index}`;
  return "count";
}

function RowView({
  row,
  renderSkill,
}: {
  row: Row;
  renderSkill: (skill: Skill) => preact.JSX.Element;
}) {
  switch (row.kind) {
    case "count":
      return (
        <div class="list-count">
          {row.total} skill{row.total !== 1 ? "s" : ""}
        </div>
      );
    case "group":
      return <div class="group-label">{row.label}</div>;
    case "subgroup":
      return <div class="group-sublabel">{row.folder}</div>;
    case "skill":
      return renderSkill(row.skill);
  }
}
