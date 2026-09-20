// Czech weekday abbreviations as used in TSK's tariftext field, Monday-first.
const DAY_ORDER = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

/**
 * Expands a Czech weekday token (single day or Mon-first range) into 0-indexed day numbers.
 * @example expandDayRange("Po-Pá") -> [0, 1, 2, 3, 4]
 * @example expandDayRange("So") -> [5]
 */
export function expandDayRange(token: string): number[] {
  const [from, to] = token.split("-");
  const start = DAY_ORDER.indexOf(from);
  if (!to) return [start];
  const end = DAY_ORDER.indexOf(to);
  const days: number[] = [];
  for (let i = start; i <= end; i++) days.push(i);
  return days;
}
