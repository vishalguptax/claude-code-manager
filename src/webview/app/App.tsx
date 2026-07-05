/**
 * Root component for the Preact webview. Hosts the tab bar and lazy-loaded
 * per-feature panel, wrapped in an ErrorBoundary so a feature crash does not
 * tear down the rest of the shell.
 */

import { activeTab } from "../shared/model";
import { hostBusy } from "../shared/model/hostBusy";
import { ErrorBoundary } from "./ErrorBoundary";
import { TabBar, TabPanel } from "./tabs";

export function App() {
  const current = activeTab.value;
  return (
    <ErrorBoundary>
      {/* Indeterminate bar shown while a host request runs longer than a
          beat — the user's click always produces visible progress. */}
      {hostBusy.value && <div class="host-busy-bar" role="progressbar" />}
      <TabBar />
      <div class="tab-content-area">
        <div class="tab-content">
          <TabPanel feature={current} />
        </div>
      </div>
    </ErrorBoundary>
  );
}
