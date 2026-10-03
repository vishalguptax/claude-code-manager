// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { _resetConfigState, toggleSection } from "../../model";
import { infoFor, toggle } from "../../__tests__/dom";
import { makeConfigData } from "../../__tests__/fixtures";
import { InterfaceSection } from "./InterfaceSection";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("InterfaceSection", () => {
  beforeEach(() => {
    _resetConfigState();
    toggleSection("interface");
  });

  it("renders statusLineCommand as a read-only code block, not an editable input", () => {
    const { api } = setup();
    const cmd = "bash ~/.claude/statusline-command.sh";
    const data = makeConfigData({
      settings: { ...makeConfigData().settings, statusLineCommand: cmd },
    });
    const { container } = render(<InterfaceSection data={data} api={api} />);
    const code = container.querySelector("code.cfg-code");
    expect(code?.classList.contains("code-readonly")).toBe(true);
    expect(code?.textContent).toBe(cmd);
    // Full value exposed via title for hover discovery when it scrolls.
    expect(code?.getAttribute("title")).toBe(cmd);
    expect(container.querySelector('input[aria-label="Status line command"]')).toBeNull();
  });

  it("writes verbose as true, and removes the key to turn it back off", () => {
    const { api, post } = setup();
    const { container } = render(<InterfaceSection data={makeConfigData()} api={api} />);
    fireEvent.click(toggle(container, "Verbose tool output"));
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "verbose",
      value: true,
      scope: "global",
    });
  });

  // A label that already says it all gets no InfoTip: an icon that only
  // repeats the label is the noise the redesign removed.
  it("adds an InfoTip only where it says more than the label", () => {
    const { api } = setup();
    const { container } = render(<InterfaceSection data={makeConfigData()} api={api} />);
    expect(infoFor(container, "Verbose tool output")).toMatch(/full command output/);
    expect(infoFor(container, "Voice dictation")).toBeNull();
  });
});
