/**
 * One labelled fact in a plugin detail view, on the shared `.d-kv` row.
 * Renders nothing when the value is empty: a plugin the catalog or the
 * install record says nothing about should not show an empty label.
 */
export interface FactProps {
  k: string;
  value: string;
}

export function Fact({ k, value }: FactProps) {
  if (value === "") return null;
  return (
    <div class="d-kv">
      <span class="d-k">{k}</span>
      <span class="d-v" title={value}>
        {value}
      </span>
    </div>
  );
}
