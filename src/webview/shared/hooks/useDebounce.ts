/**
 * Debounce a value, emitting the latest input only after `delay` ms of silence.
 */
import { useEffect, useState } from "preact/hooks";

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
