// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { attributionMode, NumberField, ToggleField, writeDefaultOn } from "./SettingFields";

describe("NumberField", () => {
  function renderField(onValue = vi.fn(), value = 0) {
    render(
      <NumberField
        label="Retention (days)"
        ariaLabel="Retention"
        value={value}
        placeholder="30"
        onValue={onValue}
      />,
    );
    return { onValue, input: screen.getByLabelText("Retention") as HTMLInputElement };
  }

  it("hands back a positive whole number", () => {
    const { onValue, input } = renderField();
    fireEvent.input(input, { target: { value: " 3650 " } });
    expect(onValue).toHaveBeenLastCalledWith(3650);
  });

  // Blank, zero and text all mean "Claude Code's default": removing the key
  // beats writing a value the CLI rejects.
  it.each(["", "0", "-5", "abc"])("hands back \"\" for %j", (typed) => {
    const { onValue, input } = renderField(vi.fn(), 7);
    fireEvent.input(input, { target: { value: typed } });
    expect(onValue).toHaveBeenLastCalledWith("");
  });

  it("shows an unset value as empty, so the placeholder names the default", () => {
    const { input } = renderField(vi.fn(), 0);
    expect(input.value).toBe("");
  });
});

describe("ToggleField", () => {
  it("puts the explanation behind an InfoTip beside the checkbox", () => {
    const { container } = render(
      <ToggleField label="Auto memory" info="Keeps notes between sessions." checked={false} onChange={vi.fn()} />,
    );
    const tip = container.querySelector(".cfg-toggle .info-tip");
    expect(tip?.getAttribute("aria-label")).toBe("Keeps notes between sessions.");
  });

  it("renders no InfoTip when there is nothing to add", () => {
    const { container } = render(<ToggleField label="Voice dictation" checked={false} onChange={vi.fn()} />);
    expect(container.querySelector(".info-tip")).toBeNull();
  });
});

describe("writeDefaultOn", () => {
  it("stores only the OFF state of a key Claude Code defaults ON", () => {
    const post = vi.fn();
    const api = createConfigApi(post);
    writeDefaultOn(api, "autoMemoryEnabled", false);
    writeDefaultOn(api, "autoMemoryEnabled", true);
    expect(post.mock.calls.map((c) => c[0].value)).toEqual([false, ""]);
  });
});

describe("attributionMode", () => {
  it("reads an absent key as default, \"\" as none, and text as custom", () => {
    expect(attributionMode(false, "")).toBe("default");
    expect(attributionMode(true, "")).toBe("none");
    expect(attributionMode(true, "Co-authored-by")).toBe("custom");
  });
});
