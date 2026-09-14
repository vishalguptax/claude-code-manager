/**
 * Barrel for shared reactive state and the host message bus.
 */
export {
  activeTab,
  applyShellSettings,
  type Density,
  density,
  ready,
  theme,
} from "./globalSignals";
export { _resetIntro, closeIntro, introVisible, maybeShowIntro } from "./intro";
export {
  _resetMessageBus,
  dispatch,
  type Handler,
  initMessageBus,
  registerFeatureHandler,
} from "./messageBus";
export { now, startNowTicker } from "./now";
export {
  _resetPaletteSources,
  collectPaletteItems,
  PALETTE_LIMIT,
  type PaletteItem,
  type PaletteSource,
  registerPaletteSource,
  scoreItem,
} from "./palette";
export {
  _resetSections,
  collapsedSections,
  isSectionCollapsed,
  toggleSection,
} from "./sections";
