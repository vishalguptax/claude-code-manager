/**
 * Barrel for the agents `ui` segment: CDD component folders. Each subfolder
 * owns its component, co-located test, and index. Shared primitives
 * (Button, Badge, ScopeFilter, SearchInput, ListItem, VirtualList, …) are
 * imported directly from `webview/shared/ui`, not re-exported here.
 */
export { AgentDetailView, type AgentDetailViewProps } from "./AgentDetailView";
export { AgentItem, type AgentItemProps } from "./AgentItem";
export { AgentListView, type AgentListViewProps } from "./AgentListView";
export { ModelBadge, type ModelBadgeProps } from "./ModelBadge";
