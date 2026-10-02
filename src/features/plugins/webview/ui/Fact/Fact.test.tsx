// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { Fact } from "./Fact";

describe("Fact", () => {
  it("renders a labelled value on the shared key/value row", () => {
    const { container } = render(<Fact k="From" value="caveman" />);
    expect(container.querySelector(".d-kv .d-k")?.textContent).toBe("From");
    expect(container.querySelector(".d-kv .d-v")?.textContent).toBe("caveman");
  });

  it("renders nothing for an empty value", () => {
    const { container } = render(<Fact k="Author" value="" />);
    expect(container.innerHTML).toBe("");
  });
});
