/**
 * Barrel for the commands feature model segment — reactive signals and the
 * derived `filteredCommands` view plus the scope-count helper.
 */
export {
  claudeCodeInstalled,
  commands,
  countByScope,
  errorMessage,
  filteredCommands,
  loading,
  resetCommandSignals,
  type ScopeFilter,
  scopeFilter,
  searchQuery,
  selected,
} from "./signals";
