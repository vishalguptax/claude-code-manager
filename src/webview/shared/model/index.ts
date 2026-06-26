/**
 * Barrel for shared reactive state and the host message bus.
 */
export { activeTab, ready, theme } from "./globalSignals";
export { now, startNowTicker } from "./now";
export {
  _resetMessageBus,
  dispatch,
  type Handler,
  initMessageBus,
  registerFeatureHandler,
} from "./messageBus";
