/**
 * Cross-tab UI contract.
 *
 * Every feature tab is an independent module, so nothing stops one from
 * inventing its own layout, its own row class or its own search field.
 * Four tabs did exactly that — built in parallel, each without sight of
 * the others — and shipped a panel that could not scroll, a search box
 * that did not align with its rows, and three different spacing rhythms.
 * None of it was visible to the compiler or to any per-feature test,
 * because each tab was internally consistent.
 *
 * These checks are deliberately structural rather than visual. They
 * cannot prove a tab looks right, but they catch the specific
 * divergences that produced user-visible breakage, and they fail on the
 * NEXT tab that skips the contract rather than after someone notices.
 *
 * Source scanning is the only way to assert this across features without
 * mounting every tab with a full fixture set. It mirrors the approach
 * density.test.ts takes for stylesheets and schemaCoverage.test.ts takes
 * for the protocol.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { TABS } from "../tabRegistry";

const FEATURES_DIR = path.join(__dirname, "../../../../features");

/** Every .tsx source under a feature's webview directory, concatenated. */
function webviewSource(feature: string): string {
  const root = path.join(FEATURES_DIR, feature, "webview");
  if (!fs.existsSync(root)) return "";
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        walk(full);
      } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
        out.push(fs.readFileSync(full, "utf8"));
      }
    }
  };
  walk(root);
  return out.join("\n");
}

const sources = new Map(TABS.map((t) => [t.id, webviewSource(t.id)]));

describe("tab UI contract", () => {
  it("finds a webview for every registered tab", () => {
    // Guard the guard: an empty source would make every check below pass
    // vacuously.
    for (const tab of TABS) {
      expect(sources.get(tab.id)?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it.each(TABS.map((t) => t.id))(
    "%s renders its root as .panel so the tab can scroll",
    (id) => {
      // tabs.css: `.tab-content .panel` owns flex sizing, min-height:0 and
      // overflow-y:auto. A feature root without it is a tab whose content
      // is simply unreachable past the fold — the Checkpoints bug.
      expect(sources.get(id)).toMatch(/class="panel/);
    },
  );

  /**
   * Tabs whose search field is NOT a list filter.
   *
   * `config`'s search sits inside a settings `.section`, beside a
   * ScopeFilter and above two permission lists — it is a form field, and
   * `.search-row`'s list inset would push it out of alignment with the
   * section it belongs to. Exempted deliberately rather than by
   * weakening the rule for every tab.
   */
  const NOT_A_LIST_FILTER = new Set(["config"]);

  it.each(TABS.map((t) => t.id))("%s uses the shared search row when it searches", (id) => {
    const src = sources.get(id) ?? "";
    // Only tabs that actually offer a list search are held to this.
    if (!src.includes("<SearchInput") || NOT_A_LIST_FILTER.has(id)) return;
    // components.css insets .search-row to --space-2xl specifically so the
    // field's left edge lines up with the row text beneath it. A bespoke
    // wrapper is what made the new tabs' search bars look misaligned.
    expect(src).toMatch(/class="search-row/);
  });

  /**
   * Tabs with nothing list-shaped to offer the palette.
   *
   * Account and Config are single forms — there are no items to jump to,
   * so a palette source would have nothing to return.
   */
  const NO_PALETTE_ITEMS = new Set(["account", "config"]);

  it.each(TABS.map((t) => t.id))("%s feeds the command palette", (id) => {
    // Cmd+K is the cross-tab navigation surface: a tab that registers no
    // source is invisible to it, so its items simply cannot be reached
    // that way while every sibling's can.
    if (NO_PALETTE_ITEMS.has(id)) return;
    expect(sources.get(id)).toMatch(/registerPaletteSource/);
  });

  it.each(TABS.map((t) => t.id))("%s uses the shared empty state", (id) => {
    expect(sources.get(id)).toMatch(/EmptyState/);
  });

  it.each(TABS.map((t) => t.id))("%s hardcodes no pixel spacing in JSX", (id) => {
    // Spacing belongs to the --space-* scale. An inline px value is both a
    // CSS-in-TS violation (CLAUDE.md) and the usual way a tab drifts out
    // of the shared rhythm.
    const offenders = [...(sources.get(id) ?? "").matchAll(/style=\{\{[^}]*\d+px/g)].map(
      (m) => m[0],
    );
    expect(offenders).toEqual([]);
  });
});
