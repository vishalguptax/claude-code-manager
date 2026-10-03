// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetSections, toggleSection } from "../../../../../webview/shared/model";
import { createConfigApi } from "../../api";
import { BackupView } from "./BackupView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("BackupView", () => {
  beforeEach(() => {
    _resetSections();
    // The section starts folded; open it so its body is there to test.
    toggleSection("config:backup");
  });

  it("fires the brain export and import commands", () => {
    const { api, post } = setup();
    render(<BackupView api={api} />);
    fireEvent.click(screen.getByText("Export brain…"));
    expect(post).toHaveBeenCalledWith({ type: "runCommand", command: "claudeManager.exportBrain" });
    fireEvent.click(screen.getByText("Import brain…"));
    expect(post).toHaveBeenCalledWith({ type: "runCommand", command: "claudeManager.importBrain" });
  });

  // The privacy half of what a brain holds is why this line stays visible.
  it("says what a brain never includes", () => {
    const { api } = setup();
    render(<BackupView api={api} />);
    expect(screen.getByText(/Sessions and credentials are never included/)).toBeTruthy();
  });

  it("gathers the tools: settings file, /config, extension settings, diagnostics", () => {
    const { api, post } = setup();
    render(<BackupView api={api} />);
    fireEvent.click(screen.getByText("Open settings.json"));
    expect(post).toHaveBeenCalledWith({ type: "openSettingsFile", scope: "global" });
    fireEvent.click(screen.getByText("Open /config"));
    expect(post).toHaveBeenCalledWith({ type: "launchSlash", command: "/config" });
    fireEvent.click(screen.getByText("Extension settings"));
    expect(post).toHaveBeenCalledWith({ type: "openExtensionSettings" });
    fireEvent.click(screen.getByText("Run diagnostics"));
    expect(post).toHaveBeenCalledWith({ type: "runCommand", command: "claudeManager.runDiagnostics" });
  });
});
