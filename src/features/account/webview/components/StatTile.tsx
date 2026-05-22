/**
 * A single big-number stat tile (tokens / sessions / messages / cache
 * hit). The optional `title` provides a hover tooltip for the cache-hit
 * explanation.
 */

export interface StatTileProps {
  value: string;
  label: string;
  title?: string;
}

export function StatTile({ value, label, title }: StatTileProps) {
  return (
    <div class="acct-stat" title={title}>
      <div class="acct-stat-v">{value}</div>
      <div class="acct-stat-k">{label}</div>
    </div>
  );
}
