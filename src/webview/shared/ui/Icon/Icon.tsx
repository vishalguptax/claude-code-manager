/**
 * Inline-SVG icon renderer. Renders a Lucide glyph from a small internal map
 * (see iconPaths.ts) so no icon font, sprite, or network request is involved —
 * the markup ships in the bundle and respects the webview CSP.
 *
 * The glyph inner markup is a fixed internal constant (never user input), so
 * injecting it via dangerouslySetInnerHTML is safe and adds no inline style or
 * script. Stroke is `currentColor` so icons inherit text color, matching the
 * existing `.icon` / `.tab-icon` styling. Unknown names render nothing.
 */
import { ICON_PATHS } from "./iconPaths";

export interface IconProps {
  name: string;
  size?: number;
}

export function Icon({ name, size = 16 }: IconProps) {
  const inner = ICON_PATHS[name];
  if (inner === undefined) {
    // Unknown icon: render nothing rather than crash. Keep a hook for styling.
    return <span class="icon" data-icon={name} aria-hidden="true" />;
  }

  return (
    <svg
      class="icon"
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      // Safe: `inner` is fixed internal SVG geometry from iconPaths.ts, never user input.
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
