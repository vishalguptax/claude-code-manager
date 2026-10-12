/**
 * Test setup: give happy-dom's elements the `on<drag-event>` properties every
 * browser has.
 *
 * Preact chooses an event's listener name by asking `"ondragover" in el`:
 * present, it listens for `dragover`; absent, it keeps the JSX casing and
 * listens for `DragOver`, which no real event is ever called. happy-dom
 * defines `onclick` and friends but not the drag set, so without this every
 * `onDragOver` / `onDrop` handler is silently deaf in tests while working in
 * VS Code — and a drag-and-drop test could not tell working code from broken.
 */
const DRAG_EVENTS = ["dragstart", "drag", "dragenter", "dragover", "dragleave", "drop", "dragend"];

if (typeof HTMLElement !== "undefined") {
  for (const name of DRAG_EVENTS) {
    const prop = `on${name}`;
    if (!(prop in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, prop, { value: null, writable: true, configurable: true });
    }
  }
}
