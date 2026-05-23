/**
 * Lazy loader for feature webview modules. Each feature ships a default-exported
 * Preact component at `src/features/{feature}/webview/index.tsx`. We import it
 * dynamically the first time the tab is activated and cache the result.
 */

import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { Loading } from "../../../shared/ui/Loading";

export interface TabPanelProps {
  feature: string;
}

/**
 * Explicit static import map keyed by feature id. A static map (rather than a
 * template-literal dynamic import) lets the bundler statically resolve each
 * chunk, so every feature is analyzable and code-split deterministically. The
 * keys mirror `TABS` in tabRegistry.ts exactly.
 */
const featureLoaders = {
  sessions: () => import("../../../../features/sessions/webview/index"),
  skills: () => import("../../../../features/skills/webview/index"),
  commands: () => import("../../../../features/commands/webview/index"),
  hooks: () => import("../../../../features/hooks/webview/index"),
  mcp: () => import("../../../../features/mcp/webview/index"),
  agents: () => import("../../../../features/agents/webview/index"),
  account: () => import("../../../../features/account/webview/index"),
  config: () => import("../../../../features/config/webview/index"),
} as const;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; Component: ComponentType }
  | { status: "error" };

export function TabPanel({ feature }: TabPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const load = featureLoaders[feature as keyof typeof featureLoaders];
    if (!load) {
      setState({ status: "error" });
      return;
    }
    load()
      .then((mod) => {
        if (cancelled) return;
        const Component = (mod.default ?? (mod as Record<string, unknown>)[feature]) as
          | ComponentType
          | undefined;
        if (!Component) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "ready", Component });
      })
      .catch((err) => {
        console.error("[claude-manager] failed to load feature", feature, err);
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [feature]);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <EmptyState title="Failed to load tab" />;
  const { Component } = state;
  return <Component />;
}
