/**
 * Barrel for shared reactive state and the host message bus.
 */
export { activeTab, ready, theme } from "./globalSignals";
export { _resetIntro, closeIntro, introVisible, maybeShowIntro } from "./intro";
export { now, startNowTicker } from "./now";
export {
  _resetMessageBus,
  dispatch,
  type Handler,
  initMessageBus,
  registerFeatureHandler,
} from "./messageBus";
