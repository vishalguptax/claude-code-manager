/**
 * Barrel for shared reactive state and the host message bus.
 */
export { activeTab, ready, theme } from "./globalSignals";
export {
  _resetMessageBus,
  dispatch,
  type Handler,
  initMessageBus,
  registerFeatureHandler,
} from "./messageBus";
