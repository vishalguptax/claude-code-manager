// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVscodeApi } from "../../../../webview/hooks/useApi";
import { _resetMessageBus } from "../../../../webview/signals/messageBus";
import ConfigTab, { handleConfigMessage } from "../index";
import { _resetConfigState, configData, configError, loading } from "../signals";
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
    render(<ConfigTab />);
    expect(post).toHaveBeenCalledWith({ type: "getAccountData" });
    expect(screen.getByText(/Loading/)).toBeTruthy();
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

  it("posts setModel when the model select changes", async () => {
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("Behavior")).toBeTruthy());
    const select = document.getElementById("cfg-model") as HTMLSelectElement;
    select.value = "opus";
    fireEvent.change(select);
    expect(post).toHaveBeenCalledWith({ type: "setModel", model: "opus" });
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
    fireEvent.click(document.getElementById("cfg-brain-export") as HTMLButtonElement);
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
