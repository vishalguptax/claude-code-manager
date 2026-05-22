// @vitest-environment happy-dom
import { render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it } from "vitest";
import { ModelBadge } from "./ModelBadge";

describe("ModelBadge", () => {
  it("renders the model label", () => {
    render(h(ModelBadge, { model: "opus" }));
    expect(screen.getByText("opus")).toBeTruthy();
  });

  it("applies the model-specific class for known models", () => {
    render(h(ModelBadge, { model: "Sonnet" }));
    const badge = screen.getByText("Sonnet");
    expect(badge.className).toContain("agent-model-badge");
    expect(badge.className).toContain("agent-model-sonnet");
  });

  it("omits the model-specific class for unknown models", () => {
    render(h(ModelBadge, { model: "gpt" }));
    const badge = screen.getByText("gpt");
    expect(badge.className).toContain("agent-model-badge");
    expect(badge.className).not.toContain("agent-model-gpt");
  });
});
