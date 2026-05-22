/**
 * Skills list view: search row, scope filter, and the grouped skill list.
 * Reads feature signals directly; writes search/scope/selection back to
 * them. Lists longer than the virtualization threshold render through the
 * shared <VirtualList /> over a flattened row model.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { cx } from "../../../../webview/utils/classnames";
import { Icon } from "../../../../webview/components/Icon";
import { VirtualList } from "../../../../webview/components/VirtualList";
import { useApi } from "../../../../webview/hooks/useApi";
import { useDebounce } from "../../../../webview/hooks/useDebounce";
import type { Skill } from "../../types";
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
} from "../signals";
import { getSkillDetail, getSkills, launchSkillInChat, openUrl } from "../api";
import { groupSkills } from "../grouping";
import { SkillItem } from "../components/SkillItem";

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

const SCOPE_TABS: { value: ScopeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "project", label: "Project" },
  { value: "global", label: "Global" },
];

export function ListView() {
  const { post } = useApi();
  const [rawQuery, setRawQuery] = useState(searchQuery.value);
  const debounced = useDebounce(rawQuery, 150);

  // Push the debounced query into the shared signal (drives filtering).
  useEffect(() => {
    searchQuery.value = debounced.toLowerCase();
  }, [debounced]);

  const list = filteredSkills.value;
  const total = skills.value.length;
  const pluginCount = countByScope("plugin");
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
        <div class="feature-search">
          <input
            class="input"
            type="text"
            placeholder="Search skills..."
            aria-label="Search skills"
            value={rawQuery}
            onInput={(e) => setRawQuery((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRawQuery("");
            }}
          />
          {rawQuery ? (
            <button
              type="button"
              class="search-btn"
              title="Clear (Esc)"
              onClick={() => setRawQuery("")}
            >
              <Icon name="x" size={14} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          class="search-side-btn"
          title="Browse community skills (opens externally)"
          onClick={() => openUrl(post, marketplaceSkillsUrl.value)}
        >
          <Icon name="globe" size={14} />
        </button>
        <button
          type="button"
          class="search-side-btn"
          title="Refresh skills list"
          onClick={() => getSkills(post)}
        >
          <Icon name="refresh-cw" size={14} />
        </button>
      </div>

      {total > 0 ? (
        <div class="scope-filter" id="skillsScopeFilter">
          {SCOPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              class={cx("scope-btn", scopeFilter.value === tab.value && "active")}
              onClick={() => {
                scopeFilter.value = tab.value;
              }}
            >
              {tab.label} ({tab.value === "all" ? total : countByScope(tab.value as Skill["scope"])})
            </button>
          ))}
          {pluginCount > 0 ? (
            <button
              type="button"
              class={cx("scope-btn", scopeFilter.value === "plugin" && "active")}
              onClick={() => {
                scopeFilter.value = "plugin";
              }}
            >
              Plugin ({pluginCount})
            </button>
          ) : null}
        </div>
      ) : null}

      <SkillList
        list={list}
        searching={searchQuery.value.length > 0}
        marketplaceUrl={marketplaceSkillsUrl.value}
        renderSkill={renderSkill}
        onBrowse={() => openUrl(post, marketplaceSkillsUrl.value)}
      />
    </div>
  );
}

interface SkillListProps {
  list: Skill[];
  searching: boolean;
  marketplaceUrl: string;
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
            <button type="button" class="empty-link-btn" onClick={onBrowse}>
              Browse community skills →
            </button>
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

function RowView({ row, renderSkill }: { row: Row; renderSkill: (skill: Skill) => preact.JSX.Element }) {
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
