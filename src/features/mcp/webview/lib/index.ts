/**
 * Barrel for the MCP slice's pure helpers (lib segment). No JSX, no state.
 */
export {
  buildRows,
  connectionPreview,
  groupLabel,
  isUrlTransport,
  maskSensitiveValue,
  type Row,
} from "./helpers";
export {
  buildMcpMenu,
  canAuthMcp,
  canEditMcp,
  type McpMenuHandlers,
} from "./mcpMenu";
export {
  MCP_CATALOG,
  catalogAuthHint,
  catalogPreset,
  configuredNames,
  filterCatalog,
  type McpCatalogAuth,
  type McpCatalogEntry,
  type McpFormPreset,
} from "./catalog";
