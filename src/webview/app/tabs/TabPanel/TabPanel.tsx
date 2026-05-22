/**
 * Lazy loader for feature webview modules. Each feature ships a default-exported
 * Preact component at `src/features/{feature}/webview/index.tsx`. We import it
 * dynamically the first time the tab is activated and cache the result.
 */

import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { EmptyState, Loading } from "../../../shared/ui";

export interface TabPanelProps {
  feature: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; Component: ComponentType }
  | { status: "error" };

export function TabPanel({ feature }: TabPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    import(/* @vite-ignore */ `../../../../features/${feature}/webview/index.tsx`)
      .then((mod) => {
        if (cancelled) return;
        const Component = (mod.default ?? mod[feature]) as ComponentType | undefined;
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
