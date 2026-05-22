/**
 * Root component for the Preact webview. Hosts the tab bar and lazy-loaded
 * per-feature panel, wrapped in an ErrorBoundary so a feature crash does not
 * tear down the rest of the shell.
 */

import { ErrorBoundary } from "./components/ErrorBoundary";
import { activeTab } from "./signals/globalSignals";
import { TabBar } from "./tabs/TabBar";
import { TabPanel } from "./tabs/TabPanel";

export function App() {
  const current = activeTab.value;
  return (
    <ErrorBoundary>
      <TabBar />
      <div class="tab-content-area">
        <div class="tab-content">
          <TabPanel feature={current} />
        </div>
      </div>
    </ErrorBoundary>
  );
}
