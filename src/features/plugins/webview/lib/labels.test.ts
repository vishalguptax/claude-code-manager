import { describe, expect, it } from "vitest";
import {
  blocked,
  notEnabled,
  orphaned,
  overridden,
  plugin,
} from "../__tests__/fixtures";
import {
  canToggle,
  overrideChain,
  SCOPE_LABEL,
  sourceSummary,
  stateSummary,
  STATUS_LABEL,
  statusVariant,
  toggleScope,
  TRUST_LABEL,
  trustVariant,
} from "./labels";

describe("SCOPE_LABEL", () => {
  it("calls ~/.claude/settings.json the user scope, as Claude Code does", () => {
    expect(SCOPE_LABEL.global).toBe("user");
    expect(SCOPE_LABEL.project).toBe("project");
    expect(SCOPE_LABEL.local).toBe("local");
    expect(SCOPE_LABEL.managed).toBe("managed");
  });
});

describe("stateSummary", () => {
  it("says a plugin is installed but not loaded, in those words", () => {
    expect(stateSummary(notEnabled)).toContain("Installed, but no settings file enables it");
  });

  it("says an orphaned entry has no copy installed", () => {
    expect(stateSummary(orphaned)).toBe(
      "Listed in project settings, but no copy is installed.",
    );
  });

  it("names the deciding scope for an enabled plugin", () => {
    expect(stateSummary(plugin({ decidedBy: "local" }))).toBe("Enabled in local settings.");
  });

  it("names the deciding scope for a disabled plugin", () => {
    expect(stateSummary(plugin({ status: "disabled", enabled: false, decidedBy: "project" }))).toBe(
      "Disabled in project settings.",
    );
  });

  it("points a blocked plugin at the blocklist file", () => {
    expect(stateSummary(blocked)).toContain("blocklist.json");
  });
});

describe("overrideChain", () => {
  it("spells out the precedence chain lowest scope first", () => {
    expect(overrideChain(overridden)).toBe("user: on › project: off › local: on");
  });

  it("stays empty when at most one scope has an opinion", () => {
    expect(overrideChain(plugin())).toBe("");
    expect(overrideChain(notEnabled)).toBe("");
  });
});

describe("toggleScope", () => {
  it("targets the scope that currently decides the plugin", () => {
    expect(toggleScope(overridden)).toBe("local");
    expect(toggleScope(plugin({ decidedBy: "project" }))).toBe("project");
  });

  it("starts at the user scope for a plugin nobody has an opinion about", () => {
    expect(toggleScope(notEnabled)).toBe("global");
  });

  it("refuses a plugin decided by managed settings", () => {
    expect(toggleScope(plugin({ decidedBy: "managed" }))).toBeNull();
  });
});

describe("canToggle", () => {
  it("offers a switch for an ordinary plugin", () => {
    expect(canToggle(plugin())).toBe(true);
    expect(canToggle(notEnabled)).toBe(true);
  });

  it("withholds the switch for blocked and managed plugins", () => {
    expect(canToggle(blocked)).toBe(false);
    expect(canToggle(plugin({ decidedBy: "managed" }))).toBe(false);
  });
});

describe("status and trust chips", () => {
  it("labels every status", () => {
    expect(STATUS_LABEL["not-enabled"]).toBe("not enabled");
    expect(STATUS_LABEL.orphaned).toBe("no install");
    expect(STATUS_LABEL.blocked).toBe("blocked");
  });

  it("gives blocked the danger weight and the two findings the status weight", () => {
    expect(statusVariant("blocked")).toBe("danger");
    expect(statusVariant("orphaned")).toBe("status");
    expect(statusVariant("not-enabled")).toBe("status");
    expect(statusVariant("enabled")).toBe("default");
  });

  it("labels every trust level", () => {
    expect(TRUST_LABEL.unlisted).toBe("not allowed");
    expect(TRUST_LABEL.unknown).toBe("unregistered");
    expect(TRUST_LABEL.official).toBe("official");
  });

  it("flags the trust levels a user must act on", () => {
    expect(trustVariant("blocked")).toBe("danger");
    expect(trustVariant("unlisted")).toBe("danger");
    expect(trustVariant("unknown")).toBe("status");
    expect(trustVariant("known")).toBe("default");
  });
});

describe("sourceSummary", () => {
  it("shows a github repo slug bare", () => {
    expect(sourceSummary("github", "expo/skills")).toBe("expo/skills");
  });

  it("prefixes other source kinds", () => {
    expect(sourceSummary("local", "/srv/mkt")).toBe("local: /srv/mkt");
  });

  it("degrades when the source is unrecorded", () => {
    expect(sourceSummary("", "")).toBe("source unknown");
    expect(sourceSummary("command", "")).toBe("command");
  });
});
