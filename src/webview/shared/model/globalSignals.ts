/**
 * Application-wide reactive state shared across the Preact webview.
 */
import { signal } from "@preact/signals";

export const activeTab = signal<string>("sessions");
export const ready = signal<boolean>(false);
export const theme = signal<"light" | "dark">("dark");
