/**
 * Reactive state for the agents webview, powered by @preact/signals. Views
 * read the computed signals directly so updates re-render without manual
 * diffing. Lives in the FSD `model` segment: state only, no JSX.
 */
import { computed, signal } from "@preact/signals";
import type { Agent } from "../../types";

/** Filter values for the model selector. */
export type ModelFilter = "all" | "sonnet" | "opus" | "haiku";

// ── Raw state ──

/** Every agent received from the host, in host order. */
export const agents = signal<Agent[]>([]);
/** The agent shown in the detail view, or null for the list view. */
export const selectedAgent = signal<Agent | null>(null);
/** True while the initial agent request is in flight. */
export const loading = signal<boolean>(true);
/** Error string from the host, or null when healthy. */
export const error = signal<string | null>(null);
/** Lowercased free-text search query. */
export const searchQuery = signal<string>("");
/** Active model filter. */
export const filterModel = signal<ModelFilter>("all");

// ── Derived counts (drive filter button labels) ──

export const modelCounts = computed(() => {
  const list = agents.value;
  // Single pass: lowercase each model name once and increment every matching
  // bucket, instead of three separate filter passes over the whole list.
  let sonnet = 0;
  let opus = 0;
  let haiku = 0;
  for (const a of list) {
    const model = a.model.toLowerCase();
    if (model.includes("sonnet")) sonnet++;
    if (model.includes("opus")) opus++;
    if (model.includes("haiku")) haiku++;
  }
  return { all: list.length, sonnet, opus, haiku };
});

// ── Derived filtered + sorted list ──

const SCOPE_ORDER: Record<Agent["scope"], number> = { project: 0, global: 1, plugin: 2 };

/**
 * Agents filtered by the current model filter and search query, then sorted
 * by scope priority (project → global → plugin), plugin name, and finally
 * agent name. Mirrors the v1 ordering so the migration is behaviour-neutral.
 */
export const filteredAgents = computed<Agent[]>(() => {
  let list = agents.value;
  const model = filterModel.value;
  const query = searchQuery.value;

  if (model !== "all") {
    list = list.filter((a) => a.model.toLowerCase().includes(model));
  }

  if (query) {
    list = list.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.model.toLowerCase().includes(query),
    );
  }

  return [...list].sort((a, b) => {
    if (a.scope !== b.scope) return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    if (a.scope === "plugin" && a.pluginName !== b.pluginName) {
      return (a.pluginName ?? "").localeCompare(b.pluginName ?? "");
    }
    return a.name.localeCompare(b.name);
  });
});

/** Human label for the scope bucket an agent belongs to. */
export function scopeLabel(agent: Agent): string {
  if (agent.scope === "project") return "Project";
  if (agent.scope === "plugin") return `Plugin: ${agent.pluginName ?? "unknown"}`;
  return "Global";
}

/**
 * Group the filtered list into ordered scope buckets for sectioned display.
 * Insertion order follows `filteredAgents`, which is already scope-sorted.
 */
export const groupedAgents = computed<Array<{ label: string; items: Agent[] }>>(() => {
  const buckets: Array<{ label: string; items: Agent[] }> = [];
  const index = new Map<string, Agent[]>();
  for (const agent of filteredAgents.value) {
    const label = scopeLabel(agent);
    let arr = index.get(label);
    if (!arr) {
      arr = [];
      index.set(label, arr);
      buckets.push({ label, items: arr });
    }
    arr.push(agent);
  }
  return buckets;
});

// ── Mutators (called by the message handler and views) ──

/** Replace the agent list and clear loading/error. */
export function setAgents(next: Agent[]): void {
  agents.value = next;
  loading.value = false;
  error.value = null;
}

/** Record a host-reported error and clear loading. */
export function setError(message: string): void {
  error.value = message;
  loading.value = false;
}

/** Select an agent for the detail view (null returns to the list). */
export function selectAgent(agent: Agent | null): void {
  selectedAgent.value = agent;
}

/** Reset all feature state. Used on unmount and in tests. */
export function resetAgentsState(): void {
  agents.value = [];
  selectedAgent.value = null;
  loading.value = true;
  error.value = null;
  searchQuery.value = "";
  filterModel.value = "all";
}
