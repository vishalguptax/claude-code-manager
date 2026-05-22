/**
 * Barrel for the hooks slice's reactive state (signals + derived computed
 * lists) and the mutators that drive them.
 */
export {
  countByScope,
  errorMessage,
  filteredHooks,
  groupedHooks,
  hooks,
  type HookScopeFilter,
  loading,
  resetHooksState,
  scopeFilter,
  searchQuery,
  selectedHook,
  setError,
  setHooks,
} from "./signals";
