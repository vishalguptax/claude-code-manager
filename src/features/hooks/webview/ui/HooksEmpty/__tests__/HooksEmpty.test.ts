// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { h } from "preact";
import { render, screen } from "@testing-library/preact";
import { HooksEmpty } from "../HooksEmpty";

describe("HooksEmpty", () => {
  it("renders the no-hooks title and a settings.json example", () => {
    const { container } = render(h(HooksEmpty, {}));
    expect(screen.getByText("No hooks configured")).toBeTruthy();
    const pre = container.querySelector("pre.hook-example");
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toContain('"PreToolUse"');
  });
});
