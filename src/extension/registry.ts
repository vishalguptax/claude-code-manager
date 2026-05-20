export interface FeatureContribution {
  id: string;
  parsers?: Record<string, () => unknown>;
  onMessage?: (msg: unknown) => void;
}

const REGISTRY = new Map<string, FeatureContribution>();

// Registering the same id twice replaces the previous contribution; tests
// rely on this last-writer-wins behaviour so hot-reload paths stay simple.
export function registerFeature(contribution: FeatureContribution): void {
  REGISTRY.set(contribution.id, contribution);
}

export function getFeature(id: string): FeatureContribution | undefined {
  return REGISTRY.get(id);
}

export function getFeatures(): readonly FeatureContribution[] {
  return Array.from(REGISTRY.values());
}

export function clearRegistry(): void {
  REGISTRY.clear();
}
