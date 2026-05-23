// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render } from "@testing-library/preact";
import { Footer } from "./Footer";

const post = vi.fn();
vi.mock("../../../../../webview/shared/hooks", () => ({
  useApi: () => ({ post: (m: unknown) => post(m) }),
  setVscodeApi: () => {},
}));

describe("Footer", () => {
  it("opens GitHub externally via the host openUrl message", () => {
    post.mockClear();
    const { getByTitle } = render(h(Footer, {}));
    fireEvent.click(getByTitle("GitHub"));
    expect(post).toHaveBeenCalledWith({
      type: "openUrl",
      url: "https://github.com/vishalguptax/claude-code-manager",
    });
  });

  it("opens LinkedIn externally via the host openUrl message", () => {
    post.mockClear();
    const { getByTitle } = render(h(Footer, {}));
    fireEvent.click(getByTitle("LinkedIn"));
    expect(post).toHaveBeenCalledWith({
      type: "openUrl",
      url: "https://www.linkedin.com/in/vishalgupta26/",
    });
  });
});
