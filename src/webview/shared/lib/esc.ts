/**
 * Escape a string for safe HTML insertion via a DOM round-trip.
 */
export function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
