/**
 * Parses the source "day" field into ISO date strings; each entry is a single closure
 * day (typically spring + autumn), not a date range.
 * @example parseLetniDates("07.04.2026, 05.10.2026") -> ["2026-04-07", "2026-10-05"]
 */
export function parseLetniDates(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [d, m, y] = s.split(".");
      return `${y}-${m}-${d}`;
    });
}
