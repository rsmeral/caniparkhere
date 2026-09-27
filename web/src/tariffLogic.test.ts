import { describe, expect, it } from "vitest";
import { activeRuleNow, nextChange, paidWindowsOn } from "./tariffLogic";
import type { Tariff } from "./types";

/** 0=Mon..6=Sun, matching the rest of the app - read back from the Date itself so tests
 * don't depend on which date/timezone they happen to run in. */
function dayIndexOf(date: Date): number {
  return (date.getDay() + 6) % 7;
}

describe("activeRuleNow", () => {
  it("returns the matching rule inside its window", () => {
    const now = new Date(2026, 3, 6, 10, 30);
    const tariff: Tariff = {
      id: 0,
      source: "",
      holidayCapCzk: null,
      rules: [
        {
          days: [dayIndexOf(now)],
          start: "08:00",
          end: "17:59",
          pricePerHour: 40,
          dailyCapCzk: null,
        },
      ],
    };
    expect(activeRuleNow(tariff, now)).toEqual(tariff.rules[0]);
  });

  it("returns null outside the window", () => {
    const now = new Date(2026, 3, 6, 20, 0);
    const tariff: Tariff = {
      id: 0,
      source: "",
      holidayCapCzk: null,
      rules: [
        {
          days: [dayIndexOf(now)],
          start: "08:00",
          end: "17:59",
          pricePerHour: 40,
          dailyCapCzk: null,
        },
      ],
    };
    expect(activeRuleNow(tariff, now)).toBeNull();
  });

  it("returns null on a day not covered by the rule", () => {
    const now = new Date(2026, 3, 6, 10, 0);
    const otherDay = (dayIndexOf(now) + 1) % 7;
    const tariff: Tariff = {
      id: 0,
      source: "",
      holidayCapCzk: null,
      rules: [
        { days: [otherDay], start: "08:00", end: "17:59", pricePerHour: 40, dailyCapCzk: null },
      ],
    };
    expect(activeRuleNow(tariff, now)).toBeNull();
  });

  it("returns the first matching rule when a tariff has several", () => {
    const now = new Date(2026, 3, 6, 10, 0);
    const today = dayIndexOf(now);
    const tariff: Tariff = {
      id: 0,
      source: "",
      holidayCapCzk: null,
      rules: [
        {
          days: [(today + 1) % 7],
          start: "00:00",
          end: "23:59",
          pricePerHour: 10,
          dailyCapCzk: null,
        },
        { days: [today], start: "08:00", end: "17:59", pricePerHour: 40, dailyCapCzk: null },
      ],
    };
    expect(activeRuleNow(tariff, now)?.pricePerHour).toBe(40);
  });
});

describe("nextChange", () => {
  // Mon-Fri 08:00-19:59, like most of the city; 2026-09-30 is a Wednesday.
  const weekdays: Tariff = {
    id: 0,
    source: "",
    holidayCapCzk: null,
    rules: [
      { days: [0, 1, 2, 3, 4], start: "08:00", end: "19:59", pricePerHour: 40, dailyCapCzk: null },
    ],
  };
  // Every day 08:00 through 05:59 the next morning, as two calendar-day windows.
  const overnight: Tariff = {
    ...weekdays,
    rules: [
      {
        days: [0, 1, 2, 3, 4, 5, 6],
        start: "08:00",
        end: "23:59",
        pricePerHour: 40,
        dailyCapCzk: null,
      },
      {
        days: [0, 1, 2, 3, 4, 5, 6],
        start: "00:00",
        end: "05:59",
        pricePerHour: 40,
        dailyCapCzk: null,
      },
    ],
  };

  it("finds when free parking ends later today", () => {
    expect(nextChange(weekdays, new Date(2026, 8, 30, 7, 15))).toEqual({
      time: "08:00",
      daysAhead: 0,
      weekday: 2,
      minutesUntil: 45,
      rule: weekdays.rules[0],
    });
  });

  it("finds tomorrow's start in the evening, and Monday's on a Friday night", () => {
    expect(nextChange(weekdays, new Date(2026, 8, 30, 21, 0))).toMatchObject({
      time: "08:00",
      daysAhead: 1,
    });
    expect(nextChange(weekdays, new Date(2026, 9, 2, 21, 0))).toMatchObject({
      time: "08:00",
      daysAhead: 3,
      weekday: 0,
    });
  });

  it("gives the rule that starts at a change to paid, and none at a change to free", () => {
    expect(nextChange(weekdays, new Date(2026, 8, 30, 21, 0))?.rule).toEqual(weekdays.rules[0]);
    expect(nextChange(weekdays, new Date(2026, 8, 30, 12, 0))?.rule).toBeNull();
  });

  it("finds when paid parking ends", () => {
    expect(nextChange(weekdays, new Date(2026, 8, 30, 19, 30))).toMatchObject({
      time: "20:00",
      daysAhead: 0,
      minutesUntil: 30,
    });
  });

  it("follows back-to-back windows across midnight to where payment stops", () => {
    expect(nextChange(overnight, new Date(2026, 8, 30, 22, 0))).toMatchObject({
      time: "06:00",
      daysAhead: 1,
    });
  });

  it("returns null when parking never changes", () => {
    const always: Tariff = {
      ...weekdays,
      rules: [
        {
          days: [0, 1, 2, 3, 4, 5, 6],
          start: "00:00",
          end: "23:59",
          pricePerHour: 20,
          dailyCapCzk: null,
        },
      ],
    };
    expect(nextChange(always, new Date(2026, 8, 30, 12, 0))).toBeNull();
  });
});

describe("paidWindowsOn", () => {
  it("lists the day's paid windows, earliest first", () => {
    const tariff: Tariff = {
      id: 0,
      source: "",
      holidayCapCzk: null,
      rules: [
        { days: [2], start: "08:00", end: "23:59", pricePerHour: 40, dailyCapCzk: null },
        { days: [2], start: "00:00", end: "05:59", pricePerHour: 40, dailyCapCzk: null },
        { days: [5], start: "10:00", end: "12:00", pricePerHour: 40, dailyCapCzk: null },
      ],
    };
    expect(paidWindowsOn(tariff, new Date(2026, 8, 30))).toEqual(["00:00–05:59", "08:00–23:59"]);
    expect(paidWindowsOn(tariff, new Date(2026, 9, 1))).toEqual([]);
  });
});
