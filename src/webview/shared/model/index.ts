/**
 * Barrel for shared reactive state and the host message bus.
 */
export {
  activeTab,
  applyShellSettings,
  density,
  type Density,
  ready,
  theme,
} from "./globalSignals";
export { _resetIntro, closeIntro, introVisible, maybeShowIntro } from "./intro";
export { now, startNowTicker } from "./now";
export {
  _resetMessageBus,
  dispatch,
  type Handler,
  initMessageBus,
  registerFeatureHandler,
} from "./messageBus";
export {
  _resetPaletteSources,
  collectPaletteItems,
  PALETTE_LIMIT,
  type PaletteItem,
  type PaletteSource,
  registerPaletteSource,
  scoreItem,
} from "./palette";
