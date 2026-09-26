import { describe, expect, it } from "vitest";
import { activeRuleNow } from "./tariffLogic";
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
      raw: "",
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
      raw: "",
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
      raw: "",
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
      raw: "",
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
