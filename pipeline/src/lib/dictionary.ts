/**
 * Deduplicates a list of values into a lookup table plus a per-item index, so repeated
 * strings (tariff text, street names) are stored once instead of once per feature.
 * @example buildDictionary(["a", "b", "a"]) -> { table: ["a", "b"], indexes: [0, 1, 0] }
 */
export function buildDictionary<T>(values: (T | null)[]): {
  table: T[];
  indexes: (number | null)[];
} {
  const table: T[] = [];
  const seen = new Map<string, number>();
  const indexes = values.map((v) => {
    if (v === null) return null;
    const key = JSON.stringify(v);
    let idx = seen.get(key);
    if (idx === undefined) {
      idx = table.length;
      table.push(v);
      seen.set(key, idx);
    }
    return idx;
  });
  return { table, indexes };
}
