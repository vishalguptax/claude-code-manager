import { describe, it, expect, beforeEach } from "vitest";
import {
  setMarketplaceSkillsUrl,
  setMarketplaceMcpUrl,
  getMarketplaceSkillsUrl,
  getMarketplaceMcpUrl,
} from "../marketplace";

describe("marketplace url store", () => {
  // Reset to defaults between cases. The module is global state, so a
  // bad URL set by one test would otherwise leak into the next.
  beforeEach(() => {
    setMarketplaceSkillsUrl("");
    setMarketplaceMcpUrl("");
  });

  it("falls back to a non-empty default when an empty string is set", () => {
    expect(getMarketplaceSkillsUrl()).toMatch(/^https?:\/\//);
    expect(getMarketplaceMcpUrl()).toMatch(/^https?:\/\//);
  });

  it("returns the configured override when one is set", () => {
    setMarketplaceSkillsUrl("https://example.test/skills");
    setMarketplaceMcpUrl("https://example.test/mcp");
    expect(getMarketplaceSkillsUrl()).toBe("https://example.test/skills");
    expect(getMarketplaceMcpUrl()).toBe("https://example.test/mcp");
  });

  it("re-applies the default if the override is cleared", () => {
    setMarketplaceSkillsUrl("https://example.test/skills");
    setMarketplaceSkillsUrl("");
    expect(getMarketplaceSkillsUrl()).toMatch(/^https?:\/\//);
    expect(getMarketplaceSkillsUrl()).not.toBe("");
  });
});
