/**
 * Global Vitest setup.
 *
 * happy-dom does not implement `HTMLElement.prototype.attachInternals` (the
 * form-associated custom-elements API). The @vscode-elements form controls
 * (e.g. `vscode-single-select`, wrapped by our shared <Dropdown>) call it in
 * their constructor, which would throw the moment Preact creates the element in
 * a webview DOM test. We provide a minimal `ElementInternals` stub so the
 * element instantiates and our wrapper's behaviour (value sync, change-event
 * bridging) is testable. Guarded so it is a no-op in the Node test environment
 * where `HTMLElement` is absent.
 */
// lit emits a dev-only "class-field-shadowing" warning when a reactive
// property (here `value` on vscode-single-select) is assigned as a field. Our
// <Dropdown> sets `el.value` to control the element — the documented API —
// which is correct in the production (non-dev) lit build the extension ships.
// In tests the dev build surfaces this as an async unhandled rejection that
// Vitest flags as a run error, so we swallow that ONE specific message and
// rethrow everything else.
if (typeof process !== "undefined") {
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("class-field-shadowing") || msg.includes("set using class fields")) {
      return; // benign lit dev warning — see comment above
    }
    throw reason;
  });
}

if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.attachInternals) {
  // The element only reads `setValidity`/`setFormValue`; everything else can be
  // an empty shim.
  HTMLElement.prototype.attachInternals = function attachInternals(): ElementInternals {
    return {
      setValidity() {},
      setFormValue() {},
      reportValidity() {
        return true;
      },
      checkValidity() {
        return true;
      },
    } as unknown as ElementInternals;
  };
}
