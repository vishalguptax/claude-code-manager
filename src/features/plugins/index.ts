/**
 * Plugins feature barrel — the parser, the host message handler, and the
 * domain types. Everything else in the feature is internal.
 */
export { parsePluginsData, settingsScopePaths } from "./parser";
export { handlePluginsMessage } from "./messageHandlers";
export type { PluginsHostContext } from "./messageHandlers";
export type { SettingsWriter } from "./state";
export type {
  MarketplaceEntry,
  MarketplaceTrust,
  PluginEntry,
  PluginPolicyEntry,
  PluginSettingsScope,
  PluginStatus,
  PluginsData,
} from "./types";
