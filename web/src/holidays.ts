/**
 * Czech public holidays: the state holidays and other holidays of Act No. 245/2000 Sb.,
 * every one a day off. All fall on the same date each year except Good Friday and Easter
 * Monday, which follow Easter.
 */
const FIXED_HOLIDAYS = new Set([
  "01-01", // Den obnovy samostatného českého státu; Nový rok
  "05-01", // Svátek práce
  "05-08", // Den vítězství
  "07-05", // Den slovanských věrozvěstů Cyrila a Metoděje
  "07-06", // Den upálení mistra Jana Husa
  "09-28", // Den české státnosti
  "10-28", // Den vzniku samostatného československého státu
  "11-17", // Den boje za svobodu a demokracii
  "12-24", // Štědrý den
  "12-25", // 1. svátek vánoční
  "12-26", // 2. svátek vánoční
]);

/**
 * Easter Sunday in the Gregorian calendar, as a local date (the Meeus/Jones/Butcher method).
 * @example easterSunday(2026) -> 2026-04-05
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Whether a moment falls on a Czech public holiday, going by its local date. */
export function isPublicHoliday(date: Date): boolean {
  const monthDay = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (FIXED_HOLIDAYS.has(monthDay)) return true;
  const easter = easterSunday(date.getFullYear());
  const daysFromEaster = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - easter.getTime()) /
      86_400_000,
  );
  return daysFromEaster === -2 || daysFromEaster === 1; // Good Friday, Easter Monday
}
