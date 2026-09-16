/**
 * Contract between the tab registry and the two settings that control it.
 *
 * `claudeManager.hiddenTabs` / `claudeManager.tabOrder` enumerate every tab
 * id as a JSON `enum` in package.json, by hand — the manifest cannot import
 * TypeScript. A tab added to, removed from, or renamed in the registry
 * without updating both enums would silently fall out of sync: an id
 * missing from the enum still WORKS at runtime (resolveVisibleTabs ignores
 * unknown ids rather than rejecting them) but disappears from VS Code's own
 * settings UI, which is the whole point of these being settings rather than
 * a hidden JSON blob.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { TABS } from "../tabRegistry";

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../../../package.json"), "utf8"),
) as {
  contributes: { configuration: { properties: Record<string, unknown> } };
};
const props = pkg.contributes.configuration.properties;
const registryIds = TABS.map((t) => t.id);

describe("tab visibility/order settings manifest", () => {
  it.each(["claudeManager.hiddenTabs", "claudeManager.tabOrder"] as const)(
    "%s exists, defaults to empty, and enumerates exactly the current tab ids",
    (key) => {
      const setting = props[key] as
        | { type?: string; default?: unknown; items?: { enum?: unknown } }
        | undefined;
      expect(setting).toBeDefined();
      expect(setting?.type).toBe("array");
      // Empty must be the default for both: it is what makes a fresh
      // install behave exactly like the extension did before these
      // settings existed.
      expect(setting?.default).toEqual([]);
      expect(setting?.items?.enum).toEqual(registryIds);
    },
  );

  it("keeps both settings' enums identical to each other", () => {
    // They describe the same set of things (which tab); divergence would
    // mean one setting can reference a tab the other cannot.
    const hidden = (
      props["claudeManager.hiddenTabs"] as { items?: { enum?: unknown } }
    ).items?.enum;
    const order = (props["claudeManager.tabOrder"] as { items?: { enum?: unknown } }).items
      ?.enum;
    expect(hidden).toEqual(order);
  });
});
