import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  ACTIVITY_BAR_VIEW_ID,
  DEFAULT_PLACEMENT,
  USE_SECONDARY_SIDEBAR_CONTEXT_KEY,
  resolvePlacement,
  SECONDARY_SIDEBAR_VIEW_ID,
  supportsSecondarySidebar,
} from "../secondarySidebar";

describe("supportsSecondarySidebar", () => {
  it.each([
    ["1.106.0", true],
    ["1.106.0-insider", true],
    ["1.106", true],
    ["1.107.3", true],
    ["2.0.0", true],
    ["1.105.2", false],
    ["1.90.0", false],
    ["0.999.0", false],
  ])("reports %s as %s", (version, expected) => {
    expect(supportsSecondarySidebar(version)).toBe(expected);
  });

  // Anything unparseable must land on "no support": the activity-bar
  // container exists on every VS Code we ship to, the secondary one does
  // not. Guessing wrong in the other direction hides the panel entirely.
  it.each([[""], ["abc"], ["1"], ["1.x.0"], ["x.106.0"], [".106.0"], ["1.-2.0"]])(
    "falls back to unsupported for %o",
    (version) => {
      expect(supportsSecondarySidebar(version)).toBe(false);
    },
  );

  it("falls back to unsupported for undefined", () => {
    expect(supportsSecondarySidebar(undefined)).toBe(false);
  });

  it("does not throw on malformed input", () => {
    expect(() => supportsSecondarySidebar("...")).not.toThrow();
  });
});

describe("placement identifiers", () => {
  // These strings are the contract with package.json `contributes`;
  // a rename here without a manifest edit silently hides the panel.
  it("matches the manifest", () => {
    expect(ACTIVITY_BAR_VIEW_ID).toBe("claudeCodeManager.view");
    expect(SECONDARY_SIDEBAR_VIEW_ID).toBe("claudeCodeManager.secondaryView");
    expect(USE_SECONDARY_SIDEBAR_CONTEXT_KEY).toBe(
      "claudeCodeManager:useSecondarySidebar",
    );
  });

  // The two contributions must carry opposite `when` clauses on the same
  // key. Same polarity twice means the panel shows twice (or not at all),
  // and neither failure mode is visible in a unit test of activate().
  it("contributes both placements with mutually exclusive when clauses", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../../package.json"), "utf8"),
    ) as {
      contributes: {
        viewsContainers: Record<string, Array<{ id: string; when?: string }>>;
        views: Record<string, Array<{ id: string; when?: string }>>;
      };
    };
    const { viewsContainers, views } = manifest.contributes;

    // Activity bar is the NEGATED clause, so an unset key — an old host, an
    // unparseable version, activation that has not run — lands there.
    expect(viewsContainers.activitybar[0].when).toBe(`!${USE_SECONDARY_SIDEBAR_CONTEXT_KEY}`);
    expect(viewsContainers.secondarySidebar[0].when).toBe(USE_SECONDARY_SIDEBAR_CONTEXT_KEY);

    const activityView = views[viewsContainers.activitybar[0].id][0];
    const secondaryView = views[viewsContainers.secondarySidebar[0].id][0];
    expect(activityView.id).toBe(ACTIVITY_BAR_VIEW_ID);
    expect(activityView.when).toBe(`!${USE_SECONDARY_SIDEBAR_CONTEXT_KEY}`);
    expect(secondaryView.id).toBe(SECONDARY_SIDEBAR_VIEW_ID);
    expect(secondaryView.when).toBe(USE_SECONDARY_SIDEBAR_CONTEXT_KEY);
  });

  it("declares the placement setting with the activity bar as default", () => {
    // The default is what decides whether upgrading silently relocates a
    // panel the user had where they wanted it.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../../package.json"), "utf8"),
    ) as {
      contributes: {
        configuration: { properties: Record<string, { default?: unknown; enum?: string[] }> };
      };
    };
    const prop = manifest.contributes.configuration.properties["claudeManager.placement"];
    expect(prop).toBeDefined();
    expect(prop.default).toBe(DEFAULT_PLACEMENT);
    expect(prop.default).toBe("activityBar");
    expect(prop.enum).toEqual(["activityBar", "secondarySidebar"]);
  });
});

describe("resolvePlacement", () => {
  it("keeps the panel in the activity bar by default", () => {
    const r = resolvePlacement("1.137.0", "activityBar");
    expect(r.useSecondarySidebar).toBe(false);
    expect(r.viewId).toBe(ACTIVITY_BAR_VIEW_ID);
  });

  it("moves it to the secondary sidebar when asked on a capable host", () => {
    const r = resolvePlacement("1.137.0", "secondarySidebar");
    expect(r.useSecondarySidebar).toBe(true);
    expect(r.viewId).toBe(SECONDARY_SIDEBAR_VIEW_ID);
  });

  it("falls back to the activity bar when the host is too old to render it", () => {
    // The user asked for a position, not for the panel to vanish.
    const r = resolvePlacement("1.105.2", "secondarySidebar");
    expect(r.useSecondarySidebar).toBe(false);
    expect(r.viewId).toBe(ACTIVITY_BAR_VIEW_ID);
  });

  it("falls back to the activity bar for an unset or unknown setting", () => {
    for (const value of [undefined, "", "sidebar", "ACTIVITYBAR", "panel"]) {
      const r = resolvePlacement("1.137.0", value);
      expect(r.useSecondarySidebar).toBe(false);
      expect(r.viewId).toBe(ACTIVITY_BAR_VIEW_ID);
    }
  });

  it("falls back to the activity bar when the version is unparseable", () => {
    for (const version of [undefined, "", "abc", "1", "1.x.0"]) {
      expect(resolvePlacement(version, "secondarySidebar").useSecondarySidebar).toBe(false);
    }
  });
});
