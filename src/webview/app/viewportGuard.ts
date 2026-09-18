/**
 * Keeps the panel's viewport pinned at the origin.
 *
 * The app is exactly one viewport tall (#root is 100vh) and owns its own
 * scrolling inside .panel, so the document itself must never scroll. When
 * something does scroll it — a focused control positioned against the document,
 * a stray scrollIntoView — #root slides out of view and the panel looks dead:
 * there is no scrollbar (body is overflow:hidden), so the user cannot scroll
 * back, and reloading the window is the only way out.
 *
 * That exact bug shipped once (an absolutely positioned checkbox input with no
 * positioned ancestor, see .cb in components-native.css). The cause is fixed;
 * this makes the failure mode itself non-fatal, because the next one will come
 * from somewhere else.
 */

/** Install the guard. Returns a teardown for tests. */
export function installViewportGuard(): () => void {
  const snapBack = (): void => {
    if (window.scrollX === 0 && window.scrollY === 0) return;
    window.scrollTo(0, 0);
  };
  // `scroll` on the document fires for the viewport only; a .panel scrolling
  // does not reach here, so this never fights the app's own scrolling.
  document.addEventListener("scroll", snapBack, { passive: true });
  return () => document.removeEventListener("scroll", snapBack);
}
