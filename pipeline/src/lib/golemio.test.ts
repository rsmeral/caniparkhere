import { describe, expect, it } from "vitest";
import {
  type GolemioCharge,
  type GolemioPeriod,
  type GolemioTariff,
  holidayCap,
  maxStayMinutesByCode,
  tariffRules,
} from "./golemio.js";

const tariff = (id: string, ...durations: (number | null)[]): GolemioTariff => ({
  id,
  charge_bands: durations.map((maximum_duration) => ({ maximum_duration, charges: [] })),
});

const WEEKDAYS: GolemioPeriod["day_in_week"][] = ["Mo", "Tu", "We", "Th", "Fr"];
const EVERY_DAY: GolemioPeriod["day_in_week"][] = [...WEEKDAYS, "Sa", "Su"];

/** Periods on the given days, on normal days and (with `holidays`) on public holidays too. */
function periods(
  days: GolemioPeriod["day_in_week"][],
  start: string,
  end: string,
  ph: GolemioPeriod["ph"][] = ["PH_off"],
): GolemioPeriod[] {
  return ph.flatMap((flag) =>
    days.map((day_in_week) => ({ day_in_week, start: `${start}:00`, end: `${end}:00`, ph: flag })),
  );
}

const perMinute = (kcPerHour: number, p: GolemioPeriod[]): GolemioCharge => ({
  charge: String(kcPerHour / 60),
  charge_type: "other",
  charge_interval: 60,
  periods_of_time: p,
});

const total = (type: "maximum" | "minimum", kc: number, p: GolemioPeriod[]): GolemioCharge => ({
  charge: String(kc),
  charge_type: type,
  charge_interval: null,
  periods_of_time: p,
});

const withCharges = (maximumDuration: number | null, ...charges: GolemioCharge[]) => ({
  id: "t",
  charge_bands: [{ maximum_duration: maximumDuration, charges }],
});

describe("maxStayMinutesByCode", () => {
  it("keys each zone section's limit by its zone code, in minutes", () => {
    const result = maxStayMinutesByCode(
      [
        { id: "tsk2-P1-0101", tariff: "centre" },
        { id: "tsk2-P6-0001", tariff: "outer" },
      ],
      [tariff("centre", 3600), tariff("outer", 10800)],
    );
    expect(result).toEqual(
      new Map([
        ["P1-0101", 60],
        ["P6-0001", 180],
      ]),
    );
  });

  it("takes the strictest limit when a tariff has several bands", () => {
    const result = maxStayMinutesByCode(
      [{ id: "tsk2-P2-0001", tariff: "t" }],
      [tariff("t", 10800, null, 3600)],
    );
    expect(result.get("P2-0001")).toBe(60);
  });

  it("leaves out sections with no tariff, an unknown tariff, or no limit", () => {
    const result = maxStayMinutesByCode(
      [
        { id: "tsk2-A", tariff: null },
        { id: "tsk2-B", tariff: "missing" },
        { id: "tsk2-C", tariff: "unlimited" },
        { id: "other-D", tariff: "centre" },
      ],
      [tariff("unlimited", null), tariff("centre", 3600)],
    );
    expect(result.size).toBe(0);
  });
});

describe("tariffRules", () => {
  it("turns a weekday daytime rate into one rule, leaving out public holidays", () => {
    // P2-0135: "Po-Pá 08:00-19:59 40Kč/hod". The whole-day maximum is just 12 hours' worth.
    const rules = tariffRules(
      withCharges(
        43200,
        perMinute(40, periods(WEEKDAYS, "08:00", "19:59", ["PH_off", "PH_only"])),
        total("maximum", 480, periods(EVERY_DAY, "00:00", "23:59")),
        total("minimum", 10, periods(EVERY_DAY, "00:00", "23:59")),
        total("maximum", 40, periods(EVERY_DAY, "00:00", "23:59", ["PH_only"])),
      ),
    );
    expect(rules).toEqual([
      { days: [0, 1, 2, 3, 4], start: "08:00", end: "19:59", pricePerHour: 40, dailyCapCzk: null },
    ]);
  });

  it("keeps a maximum that caps a window, like a cheap night, under the day's own cap", () => {
    // P6-1102: 50 Kč/hod over 22 hours, at most 50 Kč overnight and 650 Kč a day.
    const night = (start: string, end: string) => periods(WEEKDAYS, start, end);
    const rules = tariffRules(
      withCharges(
        79200,
        perMinute(50, night("00:00", "05:59")),
        total("maximum", 50, night("00:00", "05:59")),
        perMinute(50, night("08:00", "19:59")),
        perMinute(50, night("20:00", "23:59")),
        total("maximum", 50, night("20:00", "23:59")),
        total("maximum", 650, periods(EVERY_DAY, "00:00", "23:59")),
      ),
    );
    expect(rules).toEqual([
      { days: [0, 1, 2, 3, 4], start: "00:00", end: "05:59", pricePerHour: 50, dailyCapCzk: 50 },
      { days: [0, 1, 2, 3, 4], start: "08:00", end: "19:59", pricePerHour: 50, dailyCapCzk: 650 },
      { days: [0, 1, 2, 3, 4], start: "20:00", end: "23:59", pricePerHour: 50, dailyCapCzk: 50 },
    ]);
  });

  it("applies a whole-day cap to every window it limits, even one too short to reach it", () => {
    // P3-0260: 15 Kč/hod, 22 paid hours a day, at most 90 Kč a day.
    const rules = tariffRules(
      withCharges(
        79200,
        perMinute(15, periods(["Mo"], "00:00", "05:59")),
        perMinute(15, periods(["Mo"], "08:00", "23:59")),
        total("maximum", 90, periods(EVERY_DAY, "00:00", "23:59")),
      ),
    );
    expect(rules.map((r) => r.dailyCapCzk)).toEqual([90, 90]);
  });

  it("doesn't count the price of the longest stay as a cap", () => {
    // A blue zone: 60 Kč/hod for at most 3 hours, so no stay costs more than 180 Kč anyway.
    const rules = tariffRules(
      withCharges(
        10800,
        perMinute(60, periods(WEEKDAYS, "08:00", "21:59")),
        total("maximum", 180, periods(EVERY_DAY, "00:00", "23:59")),
      ),
    );
    expect(rules[0].dailyCapCzk).toBeNull();
  });

  it("keeps a cap well under an hour's price", () => {
    // BUS-0001: "Po-Ne 08:00-19:59 300Kč/hod (max. 75 Kč)".
    const rules = tariffRules(
      withCharges(
        null,
        perMinute(300, periods(EVERY_DAY, "08:00", "19:59")),
        total("maximum", 75, periods(EVERY_DAY, "08:00", "19:59")),
      ),
    );
    expect(rules).toEqual([
      {
        days: [0, 1, 2, 3, 4, 5, 6],
        start: "08:00",
        end: "19:59",
        pricePerHour: 300,
        dailyCapCzk: 75,
      },
    ]);
  });

  it("rounds a per-minute rate back to a whole hourly price", () => {
    const rules = tariffRules(
      withCharges(null, {
        ...perMinute(50, periods(["Mo"], "08:00", "09:59")),
        charge: "0.8333333333333334",
      }),
    );
    expect(rules[0].pricePerHour).toBe(50);
  });

  it("refuses a tariff with other than one band, rather than guess between them", () => {
    expect(() => tariffRules({ id: "t", charge_bands: [] })).toThrow("0 bands");
  });
});

describe("holidayCap", () => {
  it("is the maximum that applies on public holidays only", () => {
    // P2-0135: 480 Kč on ordinary days is no real cap; on a holiday a stay costs at most 40 Kč.
    const cap = holidayCap(
      withCharges(
        43200,
        perMinute(40, periods(WEEKDAYS, "08:00", "19:59", ["PH_off", "PH_only"])),
        total("maximum", 480, periods(EVERY_DAY, "00:00", "23:59")),
        total("maximum", 40, periods(EVERY_DAY, "00:00", "23:59", ["PH_only"])),
      ),
    );
    expect(cap).toBe(40);
  });

  it("ignores a maximum that also applies on ordinary days, like a night cap", () => {
    const cap = holidayCap(
      withCharges(
        null,
        perMinute(50, periods(WEEKDAYS, "20:00", "23:59", ["PH_off", "PH_only"])),
        total("maximum", 50, periods(WEEKDAYS, "20:00", "23:59", ["PH_off", "PH_only"])),
      ),
    );
    expect(cap).toBeNull();
  });

  it("is null for a tariff with no holiday rule, like every blue zone's", () => {
    const cap = holidayCap(
      withCharges(
        10800,
        perMinute(60, periods(WEEKDAYS, "08:00", "21:59")),
        total("maximum", 180, periods(EVERY_DAY, "00:00", "23:59")),
      ),
    );
    expect(cap).toBeNull();
  });
});
