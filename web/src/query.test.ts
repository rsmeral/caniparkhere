import { describe, expect, it } from "vitest";
import type { Feature, MultiPolygon } from "geojson";
import type { LoadedData } from "./dataStore";
import { buildIndexes, isWithinBounds, queryStatus } from "./query";
import type { LetniProps, ZpsProps } from "./types";

function square(x0: number, y0: number, x1: number, y1: number) {
  return {
    type: "MultiPolygon" as const,
    coordinates: [
      [
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
      ],
    ],
  };
}

function zpsFeature(geom: MultiPolygon, props: ZpsProps): Feature<MultiPolygon, ZpsProps> {
  return { type: "Feature", geometry: geom, properties: props };
}

function letniFeature(geom: MultiPolygon, props: LetniProps): Feature<MultiPolygon, LetniProps> {
  return { type: "Feature", geometry: geom, properties: props };
}

function dayIndexOf(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function buildFixture(now: Date): LoadedData {
  const today = dayIndexOf(now);
  return {
    zps: {
      tariffs: [
        {
          id: 0,
          raw: "always on",
          rules: [
            {
              days: [0, 1, 2, 3, 4, 5, 6],
              start: "00:00",
              end: "23:59",
              pricePerHour: 20,
              dailyCapCzk: null,
            },
          ],
        },
        {
          id: 1,
          raw: "bounded",
          rules: [
            { days: [today], start: "08:00", end: "17:59", pricePerHour: 40, dailyCapCzk: 90 },
          ],
        },
      ],
      features: [
        zpsFeature(square(0, 0, 10, 10), { code: "A", category: "MIX", tariffId: 0 }),
        zpsFeature(square(20, 20, 30, 30), { code: "B", category: "MIX", tariffId: 1 }),
        zpsFeature(square(40, 40, 50, 50), { code: "C", category: "RES", tariffId: null }),
      ],
    },
    letni: {
      dates: [["2026-04-07", "2026-10-05"], ["2026-04-10"]],
      features: [
        letniFeature(square(0, 0, 10, 10), { name: "Foo St", datesId: 0 }),
        letniFeature(square(60, 60, 70, 70), { name: "Bar St", datesId: 1 }),
      ],
    },
    bounds: { minLon: -100, minLat: -100, maxLon: 100, maxLat: 100 },
  };
}

describe("queryStatus", () => {
  it("reports a closure and suppresses the upcoming-closure warning when today matches a closure date", () => {
    const now = new Date(2026, 3, 7, 10, 0); // 2026-04-07, matches Foo St's dates
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 5, 5, now);
    expect(result.status).toEqual({ kind: "closure", streetName: "Foo St" });
    expect(result.upcomingClosure).toBeNull();
  });

  it("reports an active paid tariff when inside an always-on zone", () => {
    const now = new Date(2026, 0, 1, 10, 0); // no closure dates match this day
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 5, 5, now);
    expect(result.status).toEqual({
      kind: "paidZone",
      pricePerHour: 20,
      dailyCapCzk: null,
      until: "23:59",
      code: "A",
      category: "MIX",
    });
  });

  it("reports an active paid tariff when inside the bounded window", () => {
    const now = new Date(2026, 3, 6, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 25, 25, now);
    expect(result.status).toEqual({
      kind: "paidZone",
      pricePerHour: 40,
      dailyCapCzk: 90,
      until: "17:59",
      code: "B",
      category: "MIX",
    });
  });

  it("reports freeZoneRightNow (with the zone's code/category) when outside its tariff window", () => {
    const now = new Date(2026, 3, 6, 20, 0); // past the bounded window's 17:59 end
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 25, 25, now);
    expect(result.status).toEqual({ kind: "freeZoneRightNow", code: "B", category: "MIX" });
  });

  it("reports residentZone (with the zone's code/category) regardless of time", () => {
    const now = new Date(2026, 3, 6, 3, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 45, 45, now);
    expect(result.status).toEqual({ kind: "residentZone", code: "C", category: "RES" });
  });

  it("reports clear when no zone matches", () => {
    const now = new Date(2026, 3, 6, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 100, 100, now);
    expect(result.status).toEqual({ kind: "clear" });
    expect(result.upcomingClosure).toBeNull();
  });

  it("warns about a closure within the next 7 days", () => {
    const now = new Date(2026, 3, 5, 10, 0); // 2026-04-05, Bar St closes 2026-04-10 (5 days out)
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 65, 65, now);
    expect(result.upcomingClosure).toEqual({
      date: "2026-04-10",
      daysUntil: 5,
      streetName: "Bar St",
    });
  });

  it("does not warn about a closure further out than the warning window", () => {
    const now = new Date(2026, 2, 1, 10, 0); // 2026-03-01, more than 7 days before 2026-04-10
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 65, 65, now);
    expect(result.upcomingClosure).toBeNull();
  });

  it("does not warn about a closure that has already passed", () => {
    const now = new Date(2026, 3, 15, 10, 0); // after 2026-04-10
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 65, 65, now);
    expect(result.upcomingClosure).toBeNull();
  });
});

describe("isWithinBounds", () => {
  const bounds = { minLon: 14.16, minLat: 49.84, maxLon: 14.8, maxLat: 50.27 };

  it("returns true for a point inside the envelope", () => {
    expect(isWithinBounds(bounds, 14.42, 50.08)).toBe(true);
  });

  it("returns true for a point exactly on the boundary", () => {
    expect(isWithinBounds(bounds, bounds.minLon, bounds.minLat)).toBe(true);
    expect(isWithinBounds(bounds, bounds.maxLon, bounds.maxLat)).toBe(true);
  });

  it("returns false for a point outside the envelope (e.g. a different city)", () => {
    expect(isWithinBounds(bounds, 16.6068, 49.1951)).toBe(false); // Brno
  });
});
