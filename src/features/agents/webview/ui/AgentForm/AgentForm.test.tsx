// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../../../types";
import { AgentForm } from "./AgentForm";

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "reviewer",
    description: "reviews code",
    model: "opus",
    tools: ["Read", "Grep"],
    skills: [],
    path: "/a/reviewer.md",
    content: "---\nname: reviewer\nmodel: opus\n---\nYou are a reviewer.",
    scope: "global",
    ...overrides,
  };
}

describe("AgentForm", () => {
  it("shows a scope picker in create mode and omits it in edit mode", () => {
    const { rerender } = render(
      h(AgentForm, { agent: null, onClose: () => {}, onSubmit: () => {} }),
    );
    expect(screen.getByLabelText("Agent scope")).toBeTruthy();
    expect(screen.getByText("New agent")).toBeTruthy();

    rerender(h(AgentForm, { agent: agent(), onClose: () => {}, onSubmit: () => {} }));
    expect(screen.queryByLabelText("Agent scope")).toBeNull();
    expect(screen.getByText("Edit agent")).toBeTruthy();
  });

  it("disables Create until a valid kebab name is entered", () => {
    render(h(AgentForm, { agent: null, onClose: () => {}, onSubmit: vi.fn() }));
    const save = screen.getByText("Create").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.input(screen.getByLabelText("Agent name"), { target: { value: "Bad Name" } });
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/Lowercase letters/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText("Agent name"), { target: { value: "my-agent" } });
    expect(save.disabled).toBe(false);
  });

  it("emits the parsed AgentInput on submit (tools split, inherit model)", () => {
    const onSubmit = vi.fn();
    render(h(AgentForm, { agent: null, onClose: () => {}, onSubmit }));
    fireEvent.input(screen.getByLabelText("Agent name"), { target: { value: "my-agent" } });
    fireEvent.input(screen.getByLabelText("Agent description"), { target: { value: "does things" } });
    fireEvent.input(screen.getByLabelText("Agent tools"), { target: { value: "Read, Grep , Bash" } });
    fireEvent.input(screen.getByLabelText("Agent system prompt"), { target: { value: "You are…" } });
    fireEvent.click(screen.getByText("Create"));
    expect(onSubmit).toHaveBeenCalledWith({
      scope: "global",
      name: "my-agent",
      description: "does things",
      model: "inherit",
      tools: ["Read", "Grep", "Bash"],
      skills: [],
      body: "You are…",
    });
  });

  it("prefills fields from an edited agent and keeps its scope", () => {
    const onSubmit = vi.fn();
    render(h(AgentForm, { agent: agent(), onClose: () => {}, onSubmit }));
    expect((screen.getByLabelText("Agent name") as HTMLInputElement).value).toBe("reviewer");
    expect((screen.getByLabelText("Agent tools") as HTMLInputElement).value).toBe("Read, Grep");
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "global", name: "reviewer", model: "opus" }),
    );
  });

  it("fires onClose from Cancel", () => {
    const onClose = vi.fn();
    render(h(AgentForm, { agent: null, onClose, onSubmit: () => {} }));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
