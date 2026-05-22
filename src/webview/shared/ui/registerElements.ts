/**
 * Side-effect registration of the @vscode-elements custom elements the shared
 * component layer wraps. Importing an element module calls `customElements.define`
 * exactly once for that tag; re-importing is a no-op, so this is safe to import
 * from multiple wrappers.
 *
 * Why import here (and from the wrappers) rather than in main.tsx:
 *   - main.tsx is the only always-loaded chunk (60 KB budget). @vscode-elements
 *     pulls in `lit`, which is comparatively heavy. Co-locating the side-effect
 *     import with the wrapper that needs it keeps that weight in the lazily
 *     loaded feature chunk that actually renders the element, not in main.js.
 *   - The wrappers import this module, so the elements are guaranteed registered
 *     before the first render of any wrapper. No ordering hazard.
 *
 * CSP note: @vscode-elements render into Shadow DOM with constructable
 * stylesheets (adopted via `adoptedStyleSheets`), not inline `<style>` tags in
 * the document, and contain no `eval`/`new Function`. The existing webview CSP
 * (`script-src 'nonce-…'`, `style-src 'unsafe-inline'`) already permits this —
 * no CSP change was required. See src/extension/html.ts.
 */
import "@vscode-elements/elements/dist/vscode-single-select";
import "@vscode-elements/elements/dist/vscode-option";
