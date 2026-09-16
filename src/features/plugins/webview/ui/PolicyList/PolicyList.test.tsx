// @vitest-environment happy-dom
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { policyEntry } from "../../__tests__/fixtures";
import { PolicyList } from "./PolicyList";

describe("PolicyList", () => {
  it("renders nothing when no plugin policy keys are set", () => {
    const { container } = render(<PolicyList entries={[]} />);
    expect(container.querySelector(".plg-policy")).toBeNull();
  });

  it("shows a key, its scope and its list value", () => {
    render(<PolicyList entries={[policyEntry({ value: ["expo-plugins", "caveman"] })]} />);
    expect(screen.getByText("strictKnownMarketplaces")).toBeTruthy();
    expect(screen.getByText("managed")).toBeTruthy();
    expect(screen.getByText("expo-plugins, caveman")).toBeTruthy();
  });

  it("renders boolean keys as true/false", () => {
    render(
      <PolicyList
        entries={[
          policyEntry({ key: "syncClaudeAiPlugins", scope: "global", value: false, managedOnly: false }),
        ]}
      />,
    );
    expect(screen.getByText("false")).toBeTruthy();
  });

  it("marks an empty list rather than rendering a blank line", () => {
    render(<PolicyList entries={[policyEntry({ value: [] })]} />);
    expect(screen.getByText("(empty list)")).toBeTruthy();
  });

  it("warns that a managed-only key set elsewhere has no effect", () => {
    render(
      <PolicyList
        entries={[policyEntry({ scope: "global", ignored: true, value: ["caveman"] })]}
      />,
    );
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("managed settings only");
    expect(note.textContent).toContain("no effect");
  });

  it("stays quiet about a key that is honoured where it was set", () => {
    render(<PolicyList entries={[policyEntry()]} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("renders many keys, one row each", () => {
    render(
      <PolicyList
        entries={[
          policyEntry(),
          policyEntry({ key: "blockedMarketplaces", value: ["github:bad/*"] }),
          policyEntry({ key: "appendPlugins", value: ["a@m"] }),
        ]}
      />,
    );
    expect(document.querySelectorAll(".plg-policy-row")).toHaveLength(3);
  });
});
