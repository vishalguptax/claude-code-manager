export class LRU<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const next = this.map.keys().next();
      if (next.done) break;
      this.map.delete(next.value);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  /**
   * Iterate keys in least-recently-used → most-recently-used order
   * (the backing Map's insertion order, which `get`/`set` maintain).
   * Additive read-only view; does not promote on iteration.
   */
  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  /**
   * Iterate [key, value] pairs in LRU → MRU order. Additive read-only
   * view; iterating does NOT promote, so a full scan (e.g. a search
   * over every cached entry) leaves recency ordering untouched.
   */
  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }
}
