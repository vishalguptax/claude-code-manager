// Tiny string helpers shared by the site generator. Pure, no I/O.

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for an HTML text node or a double-quoted attribute. */
export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/**
 * Plain text from a small HTML fragment (FAQ answers, h1s with an <em>).
 * Used where the same copy must appear as text: JSON-LD, <title>, llms.txt.
 */
export function strip(html) {
  return String(html)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Page URL path for a slug: "" → "/", "guides/x" → "/guides/x/". */
export function pathOf(slug) {
  return slug ? `/${slug}/` : "/";
}

/** en-US thousands separators, e.g. 66981 → "66,981". */
export function formatInt(n) {
  return Number(n).toLocaleString("en-US");
}
