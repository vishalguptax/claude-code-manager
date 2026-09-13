/**
 * Root component for the Preact webview. Hosts the tab bar and the lazy-loaded
 * per-feature panel.
 *
 * Two error boundaries, deliberately. The inner one wraps the feature panel, so
 * a crash in one tab leaves the tab bar and footer interactive and the user can
 * switch away. The outer one is the last resort for a failure in the shell
 * itself, where there is nothing left to keep interactive.
 */

import { useEffect, useState } from "preact/hooks";
import { activeTab, density } from "../shared/model";
import { hostBusy } from "../shared/model/hostBusy";
import { registerPaletteSource } from "../shared/model/palette";
import { CommandPalette } from "./CommandPalette";
import { ErrorBoundary } from "./ErrorBoundary";
import { Footer } from "./Footer";
import { Intro } from "./Intro";
import { TabBar, TabPanel } from "./tabs";
import { TABS } from "./tabs/tabRegistry";

export function App() {
  const current = activeTab.value;
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Cmd/Ctrl+K toggles the palette from anywhere in the webview, including
  // from inside a feature's own search box — the shortcut is how you escape a
  // tab-scoped search to a global one, so it must not be swallowed by inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setPaletteOpen((v) => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Tab navigation is always searchable, including for tabs that have not
  // mounted yet and therefore have registered no items of their own. It is
  // also the answer you want in exactly that case: you cannot search a tab you
  // have never opened, but you can go to it.
  useEffect(
    () =>
      registerPaletteSource("shell", () =>
        TABS.map((tab) => ({
          id: `tab:${tab.id}`,
          title: tab.label,
          group: "Go to",
          icon: tab.icon,
          run: () => {
            activeTab.value = tab.id;
          },
        })),
      ),
    [],
  );

  return (
    <ErrorBoundary>
      {/* Carries the `claudeManager.density` setting for the whole panel;
          density.css hangs every override off this one attribute. `display:
          contents` (base.css) keeps the wrapper out of layout, so TabBar, the
          content area and Footer stay direct flex children of #root exactly as
          they were before — the same trick .tab-keepalive uses. Declarative
          rather than an effect writing to document.body: Preact only ever
          touches its own tree, and the attribute cannot drift from the signal. */}
      <div class="app-shell" data-density={density.value}>
        {/* Indeterminate bar shown while a host request runs longer than a
            beat — the user's click always produces visible progress. */}
        {hostBusy.value && <div class="host-busy-bar" role="progressbar" />}
        <TabBar />
        <div class="tab-content-area">
          <div class="tab-content">
            {/* The boundary belongs HERE, around the feature, not around the
                whole shell. It used to wrap everything — App's own comment said
                it existed "so a feature crash does not tear down the rest of the
                shell", and it did exactly that: one render error in Account
                replaced the tab bar too, so the user could not switch away and
                had to reload the window.

                Keyed by tab id so switching tabs mounts a fresh boundary: a
                crashed tab must not stay crashed after you leave and come back,
                and a healthy tab must not inherit a sibling's error state. */}
            <ErrorBoundary key={current}>
              <TabPanel feature={current} />
            </ErrorBoundary>
          </div>
        </div>
        {/* Shell chrome, not feature content — visible on every tab, not just
            Sessions (where it lived before this was the app's shared footer). */}
        <Footer />
        {/* First-run welcome; renders nothing once seen (auto-plays once). */}
        <Intro />
        {/* One search across every tab. Rendered last so it layers over the
            panel, and only mounted while open. */}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
    </ErrorBoundary>
  );
}
