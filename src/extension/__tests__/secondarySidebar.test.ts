import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  ACTIVITY_BAR_VIEW_ID,
  NO_SECONDARY_SIDEBAR_CONTEXT_KEY,
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
    expect(NO_SECONDARY_SIDEBAR_CONTEXT_KEY).toBe(
      "claudeCodeManager:doesNotSupportSecondarySidebar",
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

    expect(viewsContainers.activitybar[0].when).toBe(NO_SECONDARY_SIDEBAR_CONTEXT_KEY);
    expect(viewsContainers.secondarySidebar[0].when).toBe(
      `!${NO_SECONDARY_SIDEBAR_CONTEXT_KEY}`,
    );

    const activityView = views[viewsContainers.activitybar[0].id][0];
    const secondaryView = views[viewsContainers.secondarySidebar[0].id][0];
    expect(activityView.id).toBe(ACTIVITY_BAR_VIEW_ID);
    expect(activityView.when).toBe(NO_SECONDARY_SIDEBAR_CONTEXT_KEY);
    expect(secondaryView.id).toBe(SECONDARY_SIDEBAR_VIEW_ID);
    expect(secondaryView.when).toBe(`!${NO_SECONDARY_SIDEBAR_CONTEXT_KEY}`);
  });
});
