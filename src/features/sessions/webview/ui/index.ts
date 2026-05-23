/**
 * Barrel for the sessions `ui` segment — the views and their leaf components.
 * The slice entry imports the views directly (lazy-boundary path stability);
 * this barrel exists for tests and any future cross-view composition.
 */
export { DetailView } from "./views/DetailView";
export { ListView } from "./views/ListView";
export { ActionsBar } from "./components/ActionsBar";
export { Filters } from "./components/Filters";
export { Footer } from "./components/Footer";
export { ListHeader } from "./components/ListHeader";
export { MessageItem, fmtTokens, splitHighlight } from "./components/MessageItem";
export { SessionItem, liveTitleForStatus } from "./components/SessionItem";
export { buildSessionMenuItems } from "./components/sessionMenu";
