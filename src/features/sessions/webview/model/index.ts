/**
 * Barrel for the sessions `model` segment — reactive signals, derived
 * selectors, the delta-apply helper, filter persistence wiring, and the
 * host-message handlers.
 */
export * from "./signals";
export { handleDelta, handleMessage } from "./messages";
