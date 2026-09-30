// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetSections, toggleSection } from "../../../../../webview/shared/model";
import { createConfigApi } from "../../api";
import { BrainView } from "./BrainView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("BrainView", () => {
  beforeEach(() => {
    _resetSections();
    // The section starts folded; open it so its body is there to test.
    toggleSection("config:brain");
  });

  it("fires export, import, and diagnostics commands", () => {
    const { api, post } = setup();
    render(<BrainView api={api} />);

    fireEvent.click(screen.getByText("Export Brain…"));
    expect(post).toHaveBeenCalledWith({ type: "runCommand", command: "claudeManager.exportBrain" });

    fireEvent.click(screen.getByText("Import Brain…"));
    expect(post).toHaveBeenCalledWith({ type: "runCommand", command: "claudeManager.importBrain" });

    fireEvent.click(screen.getByText("Run diagnostics"));
    expect(post).toHaveBeenCalledWith({
      type: "runCommand",
      command: "claudeManager.runDiagnostics",
    });
  });
});
