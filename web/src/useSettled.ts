import { useEffect, useState } from "preact/hooks";

/**
 * A value that follows `value` once it has stayed the same for `ms`, and starts at `initial`.
 * For something that shouldn't flicker as its input wobbles, such as GPS accuracy moving back
 * and forth across a threshold.
 */
export function useSettled<T>(value: T, initial: T, ms: number): T {
  const [settled, setSettled] = useState(initial);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
