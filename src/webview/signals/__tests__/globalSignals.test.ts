import { describe, it, expect } from "vitest";
import { activeTab, ready, theme } from "../globalSignals";

describe("globalSignals", () => {
  it("has sensible defaults", () => {
    expect(activeTab.value).toBe("sessions");
    expect(ready.value).toBe(false);
    expect(theme.value).toBe("dark");
  });

  it("activeTab is mutable", () => {
    const prev = activeTab.value;
    activeTab.value = "skills";
    expect(activeTab.value).toBe("skills");
    activeTab.value = prev;
  });
});
