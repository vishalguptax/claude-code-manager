/**
 * Barrel for the agents `model` segment: reactive signals, derived state, and
 * mutators. JSX-free.
 */
export {
  agents,
  error,
  filteredAgents,
  filterModel,
  groupedAgents,
  loading,
  type ModelFilter,
  modelCounts,
  parseErrors,
  resetAgentsState,
  scopeLabel,
  searchQuery,
  selectAgent,
  selectedAgent,
  setAgents,
  setError,
} from "./signals";
