import { describe, expect, it } from "vitest";
import type { Feature, MultiLineString, MultiPolygon } from "geojson";
import type { LoadedData } from "./dataStore";
import { buildIndexes, isWithinBounds, queryStatus } from "./query";
import type { LetniProps, StreetProps, ZpsProps } from "./types";

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

function streetFeature(
  coords: [number, number][],
  props: StreetProps,
): Feature<MultiLineString, StreetProps> {
  return { type: "Feature", geometry: { type: "MultiLineString", coordinates: [coords] }, properties: props };
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
          source: "always on",
          holidayCapCzk: null,
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
          source: "bounded",
          holidayCapCzk: null,
          rules: [
            { days: [today], start: "08:00", end: "17:59", pricePerHour: 40, dailyCapCzk: 90 },
          ],
        },
        {
          id: 2,
          source: "holiday cap",
          holidayCapCzk: 40,
          rules: [
            {
              days: [0, 1, 2, 3, 4, 5, 6],
              start: "08:00",
              end: "19:59",
              pricePerHour: 30,
              dailyCapCzk: null,
            },
          ],
        },
      ],
      features: [
        zpsFeature(square(-50, -50, -40, -40), { code: "H", category: "MIX", tariffId: 2 }),
        zpsFeature(square(0, 0, 10, 10), { code: "A", category: "MIX", tariffId: 0 }),
        zpsFeature(square(20, 20, 30, 30), { code: "B", category: "MIX", tariffId: 1 }),
        zpsFeature(square(40, 40, 50, 50), { code: "C", category: "RES", tariffId: null }),
        zpsFeature(square(80, 80, 90, 90), {
          code: "D",
          category: "RES",
          tariffId: 1,
          maxStayMinutes: 60,
        }),
        // Real-world-scale coordinates (unlike the abstract-unit squares above), so
        // findNearby's meters-based distance math gives realistic separations: P1 and P2
        // sit ~14m apart, P3 sits far enough away that even a generous accuracy radius
        // (capped at MAX_AMBIGUITY_RADIUS_METERS) shouldn't reach it.
        zpsFeature(square(14.4, 50, 14.401, 50.001), { code: "P1", category: "MIX", tariffId: 0 }),
        zpsFeature(square(14.4012, 50, 14.4022, 50.001), {
          code: "P2",
          category: "RES",
          tariffId: null,
        }),
        zpsFeature(square(14.6, 50, 14.601, 50.001), { code: "P3", category: "RES", tariffId: null }),
      ],
    },
    letni: {
      dates: [["2026-04-07", "2026-10-05"], ["2026-04-10"]],
      features: [
        letniFeature(square(0, 0, 10, 10), { name: "Foo St", datesId: 0 }),
        letniFeature(square(60, 60, 70, 70), { name: "Bar St", datesId: 1 }),
      ],
    },
    streets: {
      names: ["Foo St", "Near St", "Gap St", "Lone St"],
      features: [
        streetFeature([[0, 5], [10, 5]], { nameId: 0 }),
        // Runs through P1's north part, ~45m from the point inside P1 the tests below use.
        streetFeature([[14.4, 50.0009], [14.401, 50.0009]], { nameId: 1 }),
        // Runs down the gap between P1 and P2, near P2's west edge.
        streetFeature([[14.4011, 50], [14.4011, 50.0003]], { nameId: 2 }),
        // Far from every zone.
        streetFeature([[14.5, 50], [14.501, 50]], { nameId: 3 }),
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

  it("reports a closure on any day when told every section is cleaned today", () => {
    const now = new Date(2026, 0, 1, 10, 0); // not one of Foo St's dates
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 5, 5, now, null, true);
    expect(result.status).toEqual({ kind: "closure", streetName: "Foo St" });
  });

  it("still needs a street-cleaning section at the point to report a closure", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 45, 45, now, null, true);
    expect(result.status.kind).toBe("residentZone");
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
      maxStayMinutes: null,
      from: "00:00",
      until: "23:59",
      streetName: "Foo St",
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
      maxStayMinutes: null,
      from: "08:00",
      until: "17:59",
      streetName: null,
      code: "B",
      category: "MIX",
    });
  });

  it("reports freeZoneRightNow (with the zone's code/category) when outside its tariff window", () => {
    const now = new Date(2026, 3, 6, 20, 0); // past the bounded window's 17:59 end
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 25, 25, now);
    expect(result.status).toEqual({
      kind: "freeZoneRightNow",
      streetName: null,
      code: "B",
      category: "MIX",
    });
  });

  it("lowers the cap to the tariff's holiday cap on a public holiday", () => {
    const now = new Date(2026, 8, 28, 10, 0); // Den české státnosti, a Monday
    const data = buildFixture(now);
    const result = queryStatus(data, buildIndexes(data), -45, -45, now);
    expect(result.status).toMatchObject({ kind: "paidZone", pricePerHour: 30, dailyCapCzk: 40 });
  });

  it("keeps the ordinary cap on the day after a holiday", () => {
    const now = new Date(2026, 8, 29, 10, 0);
    const data = buildFixture(now);
    const result = queryStatus(data, buildIndexes(data), -45, -45, now);
    expect(result.status).toMatchObject({ kind: "paidZone", pricePerHour: 30, dailyCapCzk: null });
  });

  it("keeps a lower ordinary cap on a holiday", () => {
    const now = new Date(2026, 8, 28, 10, 0);
    const data = buildFixture(now);
    data.zps.tariffs[2].rules[0].dailyCapCzk = 25;
    const result = queryStatus(data, buildIndexes(data), -45, -45, now);
    expect(result.status).toMatchObject({ dailyCapCzk: 25 });
  });

  it("leaves a tariff with no holiday rule as it is on a holiday", () => {
    const now = new Date(2026, 8, 28, 10, 0);
    const data = buildFixture(now);
    const result = queryStatus(data, buildIndexes(data), 5, 5, now);
    expect(result.status).toMatchObject({ kind: "paidZone", code: "A", dailyCapCzk: null });
  });

  it("reports a resident zone as paid while its tariff runs", () => {
    const now = new Date(2026, 3, 6, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 85, 85, now);
    expect(result.status).toEqual({
      kind: "paidZone",
      pricePerHour: 40,
      dailyCapCzk: 90,
      maxStayMinutes: 60,
      from: "08:00",
      until: "17:59",
      streetName: null,
      code: "D",
      category: "RES",
    });
  });

  it("reports a resident zone as free for anyone outside its tariff hours", () => {
    const now = new Date(2026, 3, 6, 20, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 85, 85, now);
    expect(result.status).toEqual({
      kind: "freeZoneRightNow",
      streetName: null,
      code: "D",
      category: "RES",
    });
  });

  it("reports residentZone for a resident zone with no tariff, regardless of time", () => {
    const now = new Date(2026, 3, 6, 3, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 45, 45, now);
    expect(result.status).toEqual({
      kind: "residentZone",
      streetName: null,
      code: "C",
      category: "RES",
    });
  });

  it("reports clear when no zone matches", () => {
    const now = new Date(2026, 3, 6, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 100, 100, now);
    expect(result.status).toEqual({ kind: "clear", streetName: null });
    expect(result.upcomingClosure).toBeNull();
  });

  it("warns about a closure within the next 5 days", () => {
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
    const now = new Date(2026, 2, 1, 10, 0); // 2026-03-01, more than 5 days before 2026-04-10
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

  it("reports the single deterministic status when no accuracy is given, even right at a zone boundary", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 14.4005, 50.0005, now);
    expect(result.status).toMatchObject({ kind: "paidZone", code: "P1" });
  });

  it("stays with the single deterministic status when the accuracy radius doesn't reach another zone", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 14.4005, 50.0005, now, 5);
    expect(result.status).toMatchObject({ kind: "paidZone", code: "P1" });
  });

  it("reports ambiguous candidates, nearest first, when the accuracy radius reaches more than one zone", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    // P1 contains the point (distance 0); P2 sits ~14m away - within a 60m fix.
    const result = queryStatus(data, indexes, 14.4005, 50.0005, now, 60);
    expect(result.status.kind).toBe("ambiguous");
    if (result.status.kind !== "ambiguous") throw new Error("unreachable");
    expect(result.status.candidates.map((c) => c.code)).toEqual(["P1", "P2"]);
    expect(result.status.candidates[0]).toMatchObject({ kind: "paidZone", code: "P1" });
    expect(result.status.candidates[1]).toMatchObject({ kind: "residentZone", code: "P2" });
  });

  it("names the street a zone is on, even when it's further than the fix's accuracy", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 14.4005, 50.0005, now, 5);
    expect(result.status).toMatchObject({ kind: "paidZone", code: "P1", streetName: "Near St" });
  });

  it("names each ambiguous candidate's own street, as seen from the zone's nearest point", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 14.4005, 50.0005, now, 60);
    if (result.status.kind !== "ambiguous") throw new Error("expected ambiguous");
    expect(result.status.candidates.map((c) => [c.code, c.streetName])).toEqual([
      ["P1", "Near St"],
      ["P2", "Gap St"],
    ]);
  });

  it("answers for the one zone the accuracy circle reaches, even with the fix just outside it", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    // ~14m west of P1, and ~100m from P2.
    const result = queryStatus(data, indexes, 14.3998, 50.0005, now, 20);
    expect(result.status).toMatchObject({ kind: "paidZone", code: "P1", streetName: "Near St" });
  });

  it("reports clear when the fix is outside every zone and its circle reaches none", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 14.3998, 50.0005, now, 5);
    expect(result.status).toEqual({ kind: "clear", streetName: null });
  });

  it("outside any zone, finds no street for a precise fix when the centerline is out of reach", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    // ~45m north of Lone St.
    const result = queryStatus(data, indexes, 14.5005, 50.0004, now, 5);
    expect(result.status).toEqual({ kind: "clear", streetName: null });
  });

  it("outside any zone, finds the street when the accuracy circle reaches its centerline", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    const result = queryStatus(data, indexes, 14.5005, 50.0004, now, 48);
    expect(result.status).toEqual({ kind: "clear", streetName: "Lone St" });
  });

  it("caps the ambiguity radius so a very inaccurate fix doesn't pull in a far-away zone", () => {
    const now = new Date(2026, 0, 1, 10, 0);
    const data = buildFixture(now);
    const indexes = buildIndexes(data);
    // P3 is ~15km from P1/P2 - far past MAX_AMBIGUITY_RADIUS_METERS even with a huge
    // reported accuracy, so this should stay a plain two-candidate (P1, P2) ambiguity.
    const result = queryStatus(data, indexes, 14.4005, 50.0005, now, 50_000);
    expect(result.status.kind).toBe("ambiguous");
    if (result.status.kind !== "ambiguous") throw new Error("unreachable");
    expect(result.status.candidates.map((c) => c.code)).toEqual(["P1", "P2"]);
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
