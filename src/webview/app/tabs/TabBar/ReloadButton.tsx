/**
 * Global reload affordance, right-aligned in the tab strip. Distinct from
 * each feature's own per-list refresh — this re-parses every tab, reloads
 * the webview document, and rebuilds extension-side state in one shot.
 *
 * Clicking posts the global `reloadAll` message through the shell's
 * `useApi` (not a feature api) and spins until the host's `reloadComplete`
 * arrives. The host then regenerates the webview html, so the spin is
 * superseded by a fresh skeleton mount — the intended "click → brief
 * reload → skeletons → data" UX. The spinner animation already respects
 * prefers-reduced-motion via the shared Button styles.
 */
import { useEffect, useState } from "preact/hooks";
import { useApi } from "../../../shared/hooks";
import { registerFeatureHandler } from "../../../shared/model";
import { Button } from "../../../shared/ui";

export function ReloadButton() {
  const { post } = useApi();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Drop the spinner once the host signals the reload finished. The
    // webview is usually re-mounted right after (fresh html), so this is
    // a belt-and-suspenders reset for the brief window before that lands.
    return registerFeatureHandler("reloadComplete", () => setLoading(false));
  }, []);

  return (
    <Button
      variant="icon"
      iconName="refresh-cw"
      loading={loading}
      class="tab-reload-btn"
      title="Reload (data + view)"
      ariaLabel="Reload (data + view)"
      onClick={() => {
        setLoading(true);
        post({ type: "reloadAll" });
      }}
    />
  );
}
