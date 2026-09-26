import { describe, expect, it } from "vitest";
import { easterSunday, isPublicHoliday } from "./holidays";

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("easterSunday", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2038, "2038-04-25"],
  ])("finds Easter %i", (year, expected) => {
    expect(localDate(easterSunday(year))).toBe(expected);
  });
});

describe("isPublicHoliday", () => {
  it("finds exactly the 13 Czech public holidays of 2026", () => {
    const holidays: string[] = [];
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
      if (isPublicHoliday(d)) holidays.push(localDate(d));
    }
    expect(holidays).toEqual([
      "2026-01-01",
      "2026-04-03", // Good Friday
      "2026-04-06", // Easter Monday
      "2026-05-01",
      "2026-05-08",
      "2026-07-05",
      "2026-07-06",
      "2026-09-28",
      "2026-10-28",
      "2026-11-17",
      "2026-12-24",
      "2026-12-25",
      "2026-12-26",
    ]);
  });

  it("covers the whole day, from midnight to midnight", () => {
    expect(isPublicHoliday(new Date(2026, 8, 28, 0, 0))).toBe(true);
    expect(isPublicHoliday(new Date(2026, 8, 28, 23, 59))).toBe(true);
    expect(isPublicHoliday(new Date(2026, 8, 29, 0, 0))).toBe(false);
  });
});
