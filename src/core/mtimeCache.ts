/**
 * Generic mtime-keyed file cache.
 *
 * Callers wrap an expensive `compute(filePath)` step in `cache.get(filePath, compute)`.
 * The cache stats the file once per call: when the recorded `mtimeMs` and `size`
 * match the previous entry, the cached value is returned without calling
 * `compute` again. Otherwise the value is recomputed, stored, and returned.
 *
 * Why mtime + size: mtime alone is not enough — file systems with second-
 * granularity timestamps (older HFS+, network shares) can let two writes
 * inside the same second land on the same mtime. Size catches that case
 * cheaply. We deliberately do NOT hash content; the whole point is to
 * avoid reading the file when the metadata is unchanged.
 *
 * On stat failure (file missing, permissions) we drop any cached entry
 * for that path and call `compute` directly. The freshly-computed value
 * is NOT cached because we have no key to invalidate against — the next
 * call will recompute too. That is the right behaviour: a file that
 * keeps disappearing is not a useful cache target.
 */
import * as fs from "fs";

interface CacheEntry<T> {
  mtimeMs: number;
  size: number;
  value: T;
}

export interface MtimeCache<T> {
  /**
   * Return a memoised value for `filePath` when its mtime + size match
   * the previously stored entry. Otherwise call `compute(filePath)`,
   * store the result keyed by the new mtime + size, and return it.
   */
  get(filePath: string, compute: (filePath: string) => T): T;
  /** Drop the cached entry for a path if any. No-op when absent. */
  invalidate(filePath: string): void;
  /** Drop all entries. */
  clear(): void;
  /** Number of cached entries. */
  size(): number;
}

export function createMtimeCache<T>(): MtimeCache<T> {
  const map = new Map<string, CacheEntry<T>>();

  return {
    get(filePath, compute) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        // ENOENT or any other stat failure — treat as "no stable key",
        // drop any prior entry, recompute uncached.
        map.delete(filePath);
        return compute(filePath);
      }

      const cached = map.get(filePath);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.value;
      }

      const value = compute(filePath);
      map.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, value });
      return value;
    },

    invalidate(filePath) {
      map.delete(filePath);
    },

    clear() {
      map.clear();
    },

    size() {
      return map.size;
    },
  };
}
