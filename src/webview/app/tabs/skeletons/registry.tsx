/**
 * Feature-id → loading skeleton map used by `TabPanel` while a feature chunk
 * is being lazy-imported (i.e. before the feature's own loading branch can
 * run). Each component lives in the SHELL bundle so it's available from
 * frame 1 of a tab activation — there's no flash of a generic loader before
 * the content-aware shape appears.
 *
 * Five of the six list-shaped tabs (skills / commands / hooks / mcp / agents)
 * share the same `<ListSkeleton />` shell because their loaded shape is the
 * same — search row + scope filter + scrolling list. The other three each
 * mirror their own layout (sessions list shell, account profile/quota/usage
 * stack, config settings card).
 *
 * Keys MUST match `TABS` ids in `tabRegistry.ts` exactly. The TabPanel falls
 * back to `<ListSkeleton />` for any unknown id, which keeps the panel
 * looking loaded instead of empty if a tab is added before its custom
 * skeleton is wired up.
 */

import type { JSX } from "preact";
import { ListSkeleton } from "../../../shared/ui";
import { AccountSkeleton } from "./AccountSkeleton";
import { ConfigSkeleton } from "./ConfigSkeleton";
import { SessionsSkeleton } from "./SessionsSkeleton";

/**
 * Zero-arg renderer signature for tab skeletons. ListSkeleton accepts optional
 * props (`rows`, `scopeFilter`), but the registry only ever invokes it with
 * no arguments — typing the slot as `() => JSX.Element` keeps the optional
 * surface out of the contract instead of widening to `ComponentType<any>`.
 */
export type TabSkeleton = () => JSX.Element;

/** Default ListSkeleton call (no overrides) for the five identical list tabs. */
function DefaultListSkeleton(): JSX.Element {
  return <ListSkeleton />;
}

export const tabSkeletons: Readonly<Record<string, TabSkeleton>> = {
  sessions: SessionsSkeleton,
  skills: DefaultListSkeleton,
  commands: DefaultListSkeleton,
  hooks: DefaultListSkeleton,
  mcp: DefaultListSkeleton,
  agents: DefaultListSkeleton,
  account: AccountSkeleton,
  config: ConfigSkeleton,
};

/** Resolve the skeleton for a feature id, falling back to the generic list
 * shape when an unknown id is requested. The fallback keeps the panel
 * content-shaped instead of empty if a new tab is added without a custom
 * skeleton. */
export function resolveTabSkeleton(feature: string): TabSkeleton {
  return tabSkeletons[feature] ?? DefaultListSkeleton;
}
