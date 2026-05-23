// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { setVscodeApi } from "../../../../../webview/shared/hooks";
import type { Command } from "../../../types";
import { CommandsListView } from "./CommandsListView";
import {
  claudeCodeInstalled,
  commands,
  resetCommandSignals,
  scopeFilter,
  selected,
} from "../../model";

function cmd(partial: Partial<Command> & Pick<Command, "name" | "scope">): Command {
  return { content: "", path: "", ...partial };
}

const SAMPLE: Command[] = [
  cmd({ name: "clear", scope: "builtin", description: "Clear" }),
  cmd({ name: "review", scope: "project", content: "review diff" }),
  cmd({ name: "deploy", scope: "global", content: "ship" }),
];

/** Drive the shared <SearchInput>: set the element value, then fire `input`. */
function typeSearch(container: ParentNode, value: string): void {
  const el = container.querySelector("vscode-textfield") as HTMLElement;
  vi.spyOn(el as unknown as { value: string }, "value", "get").mockReturnValue(value);
  fireEvent(el, new Event("input"));
}

let posted: unknown[];

beforeEach(() => {
  posted = [];
  setVscodeApi({ postMessage: (m) => posted.push(m) });
  resetCommandSignals();
});

afterEach(() => {
  setVscodeApi(null);
  vi.restoreAllMocks();
});

describe("CommandsListView", () => {
  it("shows the empty state when there are no commands", () => {
    const { container } = render(h(CommandsListView, {}));
    expect(container.querySelector(".cmd-empty-title")?.textContent).toBe("No commands yet");
    expect(container.querySelector(".scope-filter")).toBeNull();
  });

  it("renders grouped commands with a count and scope filter", () => {
    commands.value = SAMPLE;
    const { container } = render(h(CommandsListView, {}));
    expect(container.querySelector(".list-count")?.textContent).toBe("3 commands");
    const labels = Array.from(container.querySelectorAll(".cmd-group-label")).map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(["Built-in", "Project Commands", "Global Commands"]);
    expect(container.querySelectorAll(".cmd-item")).toHaveLength(3);
  });

  it("selects a command on click", () => {
    commands.value = SAMPLE;
    const { container } = render(h(CommandsListView, {}));
    const reviewRow = Array.from(container.querySelectorAll(".cmd-item")).find(
      (el) => el.querySelector(".cmd-item-name")?.textContent === "/review",
    ) as Element;
    fireEvent.click(reviewRow);
    expect(selected.value?.name).toBe("review");
  });

  it("filters by scope when a scope button is clicked", async () => {
    commands.value = SAMPLE;
    const { container } = render(h(CommandsListView, {}));
    const projectBtn = Array.from(container.querySelectorAll(".vsc-segmented-seg")).find((b) =>
      b.textContent?.startsWith("Project"),
    ) as Element;
    fireEvent.click(projectBtn);
    await waitFor(() => {
      expect(scopeFilter.value).toBe("project");
      expect(container.querySelectorAll(".cmd-item")).toHaveLength(1);
    });
  });

  it("posts getCommands when refresh is clicked", () => {
    commands.value = SAMPLE;
    const { container } = render(h(CommandsListView, {}));
    fireEvent.click(container.querySelector(".search-side-btn") as Element);
    expect(posted).toContainEqual({ type: "getCommands" });
  });

  it("debounces search input into a filtered result", async () => {
    commands.value = SAMPLE;
    const { container } = render(h(CommandsListView, {}));
    typeSearch(container, "deploy");
    await waitFor(
      () => {
        expect(container.querySelectorAll(".cmd-item")).toHaveLength(1);
        expect(container.querySelector(".cmd-item-name")?.textContent).toBe("/deploy");
      },
      { timeout: 1000 },
    );
  });

  it("shows the launch-in-chat button only when the extension is installed", () => {
    commands.value = SAMPLE;
    claudeCodeInstalled.value = true;
    const { container } = render(h(CommandsListView, {}));
    expect(container.querySelectorAll(".item-chat-btn").length).toBe(3);
  });

  it("labels plugin groups with the plugin name", () => {
    commands.value = [
      cmd({ name: "yell", scope: "plugin", pluginName: "b@mkt", content: "x" }),
      cmd({ name: "mystery", scope: "plugin", content: "y" }),
    ];
    const { container } = render(h(CommandsListView, {}));
    const labels = Array.from(container.querySelectorAll(".cmd-group-label")).map(
      (l) => l.textContent,
    );
    expect(labels).toContain("Plugin: b@mkt");
    expect(labels).toContain("Plugin: unknown");
  });

  it("shows a no-matching-commands message when search excludes everything", async () => {
    commands.value = SAMPLE;
    const { container } = render(h(CommandsListView, {}));
    typeSearch(container, "zzzznomatch");
    await waitFor(() => {
      expect(container.querySelector(".empty")?.textContent).toBe("No matching commands");
    });
  });

  it("virtualizes when the row count exceeds the threshold", () => {
    commands.value = Array.from({ length: 80 }, (_, i) =>
      cmd({ name: `c${i}`, scope: "global", content: "x" }),
    );
    const { container } = render(h(CommandsListView, {}));
    expect(container.querySelector(".virtual-list")).toBeTruthy();
  });
});
