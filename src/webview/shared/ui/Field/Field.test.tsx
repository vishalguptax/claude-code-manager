// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { Field } from "./Field";

describe("Field", () => {
  it("renders label, control and hint", () => {
    render(
      <Field label="Model" hint="Used for every new session.">
        <select />
      </Field>,
    );
    expect(screen.getByText("Model")).toBeTruthy();
    expect(screen.getByText("Used for every new session.")).toBeTruthy();
  });

  // A checkbox labels itself, so forcing a second label would read the name
  // twice to a screen reader.
  it("omits the label node when there is none", () => {
    const { container } = render(
      <Field hint="h">
        <input type="checkbox" />
      </Field>,
    );
    expect(container.querySelector(".field-label")).toBeNull();
  });

  it("omits the hint node when there is none", () => {
    const { container } = render(
      <Field label="Model">
        <select />
      </Field>,
    );
    expect(container.querySelector(".field-hint")).toBeNull();
  });

  // Without htmlFor the hint is merely text near the control. With it, the
  // caller can point aria-describedby at a stable id and the hint is read
  // WITH the control instead of after it.
  it("ties the label and the hint to the control id", () => {
    const { container } = render(
      <Field label="Model" htmlFor="model" hint="h">
        <select id="model" aria-describedby="model-hint" />
      </Field>,
    );
    expect(container.querySelector(".field-label")?.getAttribute("for")).toBe("model");
    expect(container.querySelector(".field-hint")?.getAttribute("id")).toBe("model-hint");
  });

  it("gives the hint no id when the field is not tied to a control", () => {
    const { container } = render(<Field label="Model" hint="h" />);
    expect(container.querySelector(".field-hint")?.hasAttribute("id")).toBe(false);
  });

  it("accepts nodes in the hint, for a pattern or a path", () => {
    const { container } = render(
      <Field
        label="Pattern"
        hint={
          <>
            Such as <code>Bash(git:*)</code>.
          </>
        }
      />,
    );
    expect(container.querySelector(".field-hint code")?.textContent).toBe("Bash(git:*)");
  });

  it("merges an extra class onto the field", () => {
    const { container } = render(<Field class="test-extra-class" label="x" />);
    expect(container.querySelector(".field.test-extra-class")).toBeTruthy();
  });
});
