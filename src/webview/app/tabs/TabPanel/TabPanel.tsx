/**
 * Keep-alive lazy loader for feature webview modules. Each feature ships a
 * default-exported Preact component at `src/features/{feature}/webview/index.tsx`.
 *
 * The first time a tab is activated we dynamically import its chunk (rendering
 * the feature's content-aware skeleton while it's in flight), then KEEP the
 * mounted component in the tree — hidden when another tab is active. Revisiting
 * a tab is therefore instant: no re-import, no fresh mount, no re-request to
 * the host, and no rebuild of the tab's (often heavy) DOM — the already-built
 * subtree simply becomes visible again. Only the first visit pays the load +
 * parse cost.
 *
 * Hidden tabs stay mounted, so a background host push still updates them via
 * their signals; that's a cheap JS diff (the browser skips layout/paint for a
 * `display:none` subtree), and no-op account pushes are already deduped
 * host-side. The alternative — unmounting on every switch — re-ran each tab's
 * mount effect (re-posting getAccountData, re-parsing, rebuilding the heatmap)
 * on every single revisit, which is what made revisiting feel slow.
 */

import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { resolveTabSkeleton } from "../skeletons";

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

export function TabPanel({ feature }: TabPanelProps) {
  // Components resolved so far, keyed by feature id. Once mounted, a tab
  // stays here for the life of the webview.
  const [loaded, setLoaded] = useState<Record<string, ComponentType>>({});
  // Features whose chunk failed to resolve (bad id, import error).
  const [failed, setFailed] = useState<Record<string, true>>({});

  useEffect(() => {
    // Already resolved (loaded or failed) — nothing to do on revisit.
    if (loaded[feature] || failed[feature]) return;

    const load = featureLoaders[feature as keyof typeof featureLoaders];
    if (!load) {
      setFailed((f) => ({ ...f, [feature]: true }));
      return;
    }

    let cancelled = false;
    load()
      .then((mod) => {
        if (cancelled) return;
        const Component = (mod.default ?? (mod as Record<string, unknown>)[feature]) as
          | ComponentType
          | undefined;
        if (!Component) {
          setFailed((f) => ({ ...f, [feature]: true }));
          return;
        }
        setLoaded((m) => ({ ...m, [feature]: Component }));
      })
      .catch((err) => {
        console.error("[claude-manager] failed to load feature", feature, err);
        if (!cancelled) setFailed((f) => ({ ...f, [feature]: true }));
      });

    return () => {
      cancelled = true;
    };
  }, [feature, loaded, failed]);

  const activeReady = Boolean(loaded[feature]);

  return (
    <>
      {/* Every tab mounted so far stays in the tree; only the active one
          is visible. Keeping the others alive is what makes revisiting
          instant. */}
      {Object.entries(loaded).map(([id, Component]) => (
        <div key={id} class={id === feature ? "tab-keepalive" : "tab-keepalive hidden"}>
          <Component />
        </div>
      ))}
      {/* First visit to the active tab: its chunk hasn't resolved yet.
          Show the content-shaped skeleton (or the error state) on top —
          the already-mounted tabs above are all hidden in this frame. */}
      {!activeReady &&
        (failed[feature] ? (
          <EmptyState title="Failed to load tab" />
        ) : (
          renderSkeleton(feature)
        ))}
    </>
  );
}

function renderSkeleton(feature: string) {
  const Skeleton = resolveTabSkeleton(feature);
  return <Skeleton />;
}
