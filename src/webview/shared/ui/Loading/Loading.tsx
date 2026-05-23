/**
 * Generic loading indicator. Renders the shared shimmer <SkeletonList /> — the
 * v1 affordance — instead of bare "Loading…" text, so every tab that shows
 * `<Loading />` while its host round-trip is in flight gets a content-shaped
 * placeholder. `rows` lets a caller tune the placeholder density to the surface
 * (e.g. a short detail header vs a long list); it defaults to the list shape.
 */
import { SkeletonList } from "../Skeleton";

export interface LoadingProps {
  /** Placeholder row count passed through to <SkeletonList /> (default 6). */
  rows?: number;
}

export function Loading({ rows }: LoadingProps = {}) {
  return <SkeletonList rows={rows} />;
}
