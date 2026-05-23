// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import { _resetMessageBus } from "../../../../webview/shared/model";
import ConfigTab, { handleConfigMessage } from "../index";
import { _resetConfigState, configData, configError, loading } from "../model";
import { makeConfigData } from "./fixtures";

describe("ConfigTab", () => {
  let post: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetConfigState();
    _resetMessageBus();
    post = vi.fn();
    setVscodeApi({ postMessage: post });
  });
  afterEach(() => setVscodeApi(null));

  it("requests data on mount and shows loading", () => {
    const { container } = render(<ConfigTab />);
    expect(post).toHaveBeenCalledWith({ type: "getAccountData" });
    expect(container.querySelector(".skeleton-list")).toBeTruthy();
  });

  it("renders all four sections once data arrives", async () => {
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("Behavior")).toBeTruthy());
    expect(screen.getByText("Permissions")).toBeTruthy();
    expect(screen.getByText("Settings history")).toBeTruthy();
    expect(screen.getByText("Brain backup")).toBeTruthy();
  });

  it("shows the empty state when not loading and no data", async () => {
    render(<ConfigTab />);
    loading.value = false;
    configData.value = null;
    await waitFor(() => expect(screen.getByText(/No config available/)).toBeTruthy());
  });

  it("shows a host error when no data loaded", async () => {
    render(<ConfigTab />);
    configError.value = "host blew up";
    await waitFor(() => expect(screen.getByText("host blew up")).toBeTruthy());
  });

  it("wires the Behavior section to the api (reset posts resetSettings)", async () => {
    // Integration check that SettingsView receives a live api. The dropdown →
    // onChange → setModel bridge is covered by the Dropdown component spec and
    // the SettingsView CDD test (web-component change events don't replay
    // reliably through the tab's signal-driven re-renders, so we assert a
    // plain Button action here instead).
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("Behavior")).toBeTruthy());
    fireEvent.click(screen.getByText("Reset settings"));
    expect(post).toHaveBeenCalledWith({ type: "resetSettings", scope: "global" });
  });

  it("renders allow/deny tools and posts a remove on click", async () => {
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("Bash(git:*)")).toBeTruthy());
    const removeBtn = document.querySelector(".acct-perm-remove") as HTMLButtonElement;
    fireEvent.click(removeBtn);
    expect(
      post.mock.calls.some((c) => c[0]?.type === "promptRemovePermission"),
    ).toBe(true);
  });

  it("posts a brain export command from the Brain section", async () => {
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("Brain backup")).toBeTruthy());
    fireEvent.click(screen.getByText("Export Brain…"));
    expect(post).toHaveBeenCalledWith({ type: "runCommand", command: "claudeManager.exportBrain" });
  });

  it("handleConfigMessage applies accountData and error", () => {
    handleConfigMessage({ type: "accountData", data: makeConfigData() });
    expect(configData.value?.profile.email).toBe("u@x.com");
    expect(loading.value).toBe(false);
    handleConfigMessage({ type: "error", message: "nope" });
    expect(configError.value).toBe("nope");
  });
});
