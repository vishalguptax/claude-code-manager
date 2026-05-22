// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { setVscodeApi } from "../../../../webview/hooks/useApi";
import { _resetMessageBus, dispatch } from "../../../../webview/signals/messageBus";
import type { Message } from "../../../../shared/protocol/messages";
import type { Command } from "../../types";
import CommandsTab, { handleCommandsMessage } from "../index";
import {
  claudeCodeInstalled,
  commands,
  errorMessage,
  loading,
  resetCommandSignals,
  selected,
} from "../signals";

let posted: unknown[];

beforeEach(() => {
  posted = [];
  setVscodeApi({ postMessage: (m) => posted.push(m) });
  _resetMessageBus();
  resetCommandSignals();
});

afterEach(() => {
  setVscodeApi(null);
});

describe("handleCommandsMessage", () => {
  it("stores the command list and clears loading + error", () => {
    loading.value = true;
    errorMessage.value = "old";
    const data: Command[] = [{ name: "a", scope: "global", content: "", path: "" }];
    handleCommandsMessage({ type: "commands", data } as Message);
    expect(commands.value).toEqual(data);
    expect(loading.value).toBe(false);
    expect(errorMessage.value).toBeNull();
  });

  it("treats a missing data payload as an empty list", () => {
    handleCommandsMessage({ type: "commands", data: undefined } as unknown as Message);
    expect(commands.value).toEqual([]);
  });

  it("records an error message", () => {
    handleCommandsMessage({ type: "error", message: "boom" } as Message);
    expect(errorMessage.value).toBe("boom");
    expect(loading.value).toBe(false);
  });

  it("reads the extension-installed flag from settings", () => {
    handleCommandsMessage({
      type: "settings",
      claudeCodeExtensionInstalled: true,
    } as unknown as Message);
    expect(claudeCodeInstalled.value).toBe(true);
  });
});

describe("CommandsTab", () => {
  it("requests commands on mount", async () => {
    render(h(CommandsTab, {}));
    await waitFor(() => expect(posted).toContainEqual({ type: "getCommands" }));
  });

  it("shows a loading indicator before data arrives", () => {
    const { container } = render(h(CommandsTab, {}));
    expect(container.querySelector(".loading")).toBeTruthy();
  });

  it("renders the list once commands are present", async () => {
    commands.value = [{ name: "a", scope: "global", content: "x", path: "" }];
    loading.value = false;
    const { container } = render(h(CommandsTab, {}));
    await waitFor(() => expect(container.querySelector(".cmd-list-count")).toBeTruthy());
  });

  it("renders the detail view when a command is selected", async () => {
    commands.value = [{ name: "a", scope: "global", content: "x", path: "/p/a.md" }];
    loading.value = false;
    selected.value = commands.value[0] ?? null;
    const { container } = render(h(CommandsTab, {}));
    await waitFor(() => expect(container.querySelector(".cmd-detail-title")?.textContent).toBe("/a"));
  });

  it("shows an error banner after an error message arrives", async () => {
    const { container } = render(h(CommandsTab, {}));
    await waitFor(() => expect(posted).toContainEqual({ type: "getCommands" }));
    dispatch({ type: "error", message: "nope" } as Message);
    await waitFor(() => {
      expect(container.querySelector(".empty")?.textContent).toContain("nope");
    });
  });

  it("registers a bus handler so dispatched commands messages update signals", async () => {
    render(h(CommandsTab, {}));
    // The tab registers handlers on mount; driving the bus (as the shell's
    // initMessageBus does) must flow into the feature signals.
    const data: Command[] = [{ name: "z", scope: "builtin", content: "", path: "" }];
    await waitFor(() => expect(posted).toContainEqual({ type: "getCommands" }));
    dispatch({ type: "commands", data } as Message);
    expect(commands.value).toEqual(data);
  });

  it("unregisters its bus handlers on unmount", async () => {
    const { unmount } = render(h(CommandsTab, {}));
    await waitFor(() => expect(posted).toContainEqual({ type: "getCommands" }));
    unmount();
    commands.value = [];
    dispatch({ type: "commands", data: [{ name: "x", scope: "global", content: "", path: "" }] } as Message);
    expect(commands.value).toEqual([]);
  });
});
