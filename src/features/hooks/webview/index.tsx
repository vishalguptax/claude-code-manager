/**
 * Hooks webview — F1 stub. F2 will replace this with the ported Preact UI.
 */
import { EmptyState } from "../../../webview/components/EmptyState";

export default function HooksTab() {
  return (
    <EmptyState
      title="Hooks migration pending"
      description="This tab will be migrated to Preact in F2."
    />
  );
}
