/**
 * Placeholder icon renderer. Real lucide SVG integration arrives in F2.
 */
export interface IconProps {
  name: string;
  size?: number;
}

export function Icon({ name, size = 16 }: IconProps) {
  return <span class="icon" data-icon={name} data-size={size} />;
}
