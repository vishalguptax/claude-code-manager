/**
 * Lucide icon SVG paths.
 *
 * Each key maps to the SVG inner markup for a 24x24 viewBox.
 * Only icons actually used by the webview are included to minimize bundle size.
 *
 * @see https://lucide.dev
 */

/** Map of icon name to SVG inner paths (24x24 viewBox). */
export const ICONS: Record<string, string> = {
  /** Plus sign -- used for "New Session" button */
  "plus":
    `<path d="M5 12h14"/><path d="M12 5v14"/>`,

  /** Play triangle -- used for resume actions */
  "play":
    `<polygon points="6 3 20 12 6 21 6 3"/>`,

  /** Split square -- used for "Resume All" button */
  "split-square-horizontal":
    `<path d="M12 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/>`,

  /** Circular arrows -- used for refresh button */
  "refresh-cw":
    `<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>`,

  /** X mark -- used for search clear button */
  "x":
    `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,

  /** Chevron down -- used for dropdown toggle */
  "chevron-down":
    `<path d="m6 9 6 6 6-6"/>`,

  /** Pin -- used for pinned session indicator */
  "pin":
    `<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/>`,

  /** Pin off -- used for unpin action */
  "pin-off":
    `<path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1v2.34"/><path d="m2 2 20 20"/><path d="M9 13.17 6.11 14.45A2 2 0 0 0 5 16.24V16a1 1 0 0 0 1 1h12"/>`,

  /** Git fork -- used for fork session action */
  "git-fork":
    `<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>`,

  /** Terminal prompt -- used for copy command action */
  "terminal":
    `<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>`,

  /** Copy -- used for copy session ID action */
  "copy":
    `<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`,

  /** Trash -- used for delete action */
  "trash-2":
    `<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>`,

  /** Left arrow -- used for back navigation */
  "arrow-left":
    `<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>`,

  /** External link -- used for "Open Project" button */
  "external-link":
    `<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>`,

  /** Alert circle -- used for cross-project notice */
  "circle-alert":
    `<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>`,

  /** GitHub logo -- used in footer */
  "github":
    `<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>`,

  /** LinkedIn logo -- used in footer */
  "linkedin":
    `<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>`,

  /** Search magnifying glass -- used for search icon */
  "search":
    `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`,

  /** File text -- used for skill file icon */
  "file-text":
    `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>`,
};

/**
 * Render an inline SVG icon by name.
 *
 * @param name - The icon name (must be a key in the ICONS map)
 * @param size - Width and height in pixels (default 16)
 * @returns An SVG string ready for innerHTML insertion
 */
export function icon(name: string, size = 16): string {
  const paths = ICONS[name] || "";
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
