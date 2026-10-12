/**
 * Picks what a document renders: the sidebar app, or — when the host booted
 * it as an editor tab (`data-view` on #root, see extension/html.ts) — one
 * session's detail or the sessions explorer.
 *
 * A tab's code loads lazily, as each sidebar tab does in TabPanel, so the
 * sidebar's first paint carries none of it.
 */
import type { ComponentChild } from "preact";
import { useEffect, useState } from "preact/hooks";
import { DetailSkeleton } from "../../features/sessions/webview/ui/views/DetailSkeleton";
import { EmptyState } from "../shared/ui/EmptyState";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { TooltipLayer } from "./TooltipLayer";

export interface RootProps {
  /** "session" or "explorer" for an editor tab; absent for the sidebar. */
  view: string | undefined;
  sessionId: string | undefined;
}

export function Root({ view, sessionId }: RootProps) {
  if (view === "session" && sessionId) {
    return (
      <EditorTab
        load={() =>
          import("../../features/sessions/webview/panel").then(({ SessionPanel }) => (
            <SessionPanel sessionId={sessionId} />
          ))
        }
      />
    );
  }
  if (view === "explorer") {
    return (
      <EditorTab
        load={() =>
          import("../../features/sessions/webview/explorer").then(({ SessionsExplorer }) => (
            <SessionsExplorer />
          ))
        }
      />
    );
  }
  return <App />;
}

/** Shell for an editor tab: load its view, with a skeleton until it lands. */
function EditorTab({ load }: { load: () => Promise<ComponentChild> }) {
  const [content, setContent] = useState<ComponentChild | null>(null);
  const [failed, setFailed] = useState(false);

  // Runs once: `load` is a fresh closure every render, but a tab's kind
  // never changes for the life of its document.
  useEffect(() => {
    let cancelled = false;
    load()
      .then((node) => {
        if (!cancelled) setContent(node);
      })
      .catch((err) => {
        console.error("[claude-manager] failed to load the editor tab", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div class="app-shell">
      <ErrorBoundary>
        {content ?? (failed ? <EmptyState title="Failed to load" /> : <DetailSkeleton />)}
      </ErrorBoundary>
      <TooltipLayer />
    </div>
  );
}
