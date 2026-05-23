// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { BrainView } from "./BrainView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("BrainView", () => {
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
