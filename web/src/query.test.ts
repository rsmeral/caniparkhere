import { describe, expect, it } from "vitest";
import type { Feature, MultiLineString, MultiPolygon } from "geojson";
import type { LoadedData } from "./dataStore";
import { buildIndexes, isWithinBounds, queryPlaces } from "./query";
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
  return {
    type: "Feature",
    geometry: { type: "MultiLineString", coordinates: [coords] },
    properties: props,
  };
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
        zpsFeature(square(14.6, 50, 14.601, 50.001), {
          code: "P3",
          category: "RES",
          tariffId: null,
        }),
      ],
    },
    letni: {
      dates: [["2026-04-07", "2026-10-05"], ["2026-04-10"], ["2026-01-02"]],
      features: [
        letniFeature(square(0, 0, 10, 10), { name: "Foo St", datesId: 0 }),
        letniFeature(square(60, 60, 70, 70), { name: "Bar St", datesId: 1 }),
        // Real-scale sections: along Near St through P1's north part (~39m from the point
        // inside P1 the tests use), along Lone St's west end, and one named only by a placeholder code,
        // on Gap St between P1 and P2.
        letniFeature(square(14.4, 50.00085, 14.401, 50.00095), { name: "near st", datesId: 2 }),
        letniFeature(square(14.5, 49.99995, 14.5003, 50.00005), { name: "Lone St", datesId: 2 }),
        letniFeature(square(14.40105, 50, 14.40115, 50.0003), { name: "NN9", datesId: 2 }),
        // On its own street ~14m west of P1 and ~64m from the point inside it, cleaned on
        // 2026-04-10 only.
        letniFeature(square(14.3994, 50.0003, 14.3996, 50.0006), { name: "Side St", datesId: 1 }),
      ],
    },
    streets: {
      // Bar St has a cleaning section but no centerline.
      names: ["Foo St", "Near St", "Gap St", "Lone St", "Bar St", "Side St"],
      features: [
        streetFeature(
          [
            [0, 5],
            [10, 5],
          ],
          { nameId: 0 },
        ),
        // Runs through P1's north part, ~45m from the point inside P1 the tests below use.
        streetFeature(
          [
            [14.4, 50.0009],
            [14.401, 50.0009],
          ],
          { nameId: 1 },
        ),
        // Runs down the gap between P1 and P2, near P2's west edge.
        streetFeature(
          [
            [14.4011, 50],
            [14.4011, 50.0003],
          ],
          { nameId: 2 },
        ),
        // Far from every zone.
        streetFeature(
          [
            [14.5, 50],
            [14.501, 50],
          ],
          { nameId: 3 },
        ),
      ],
    },
    bounds: { minLon: -100, minLat: -100, maxLon: 100, maxLat: 100 },
  };
}

function placesAt(
  now: Date,
  lon: number,
  lat: number,
  accuracyMeters: number | null = null,
  cleaningEverywhereToday = false,
) {
  const data = buildFixture(now);
  return queryPlaces(
    data,
    buildIndexes(data),
    lon,
    lat,
    now,
    accuracyMeters,
    cleaningEverywhereToday,
  );
}

const NO_CLEANING = { today: false, upcoming: null };

describe("queryPlaces", () => {
  describe("a zone's rules", () => {
    it("reports an always-on tariff as paid, with the street the zone is on", () => {
      const now = new Date(2026, 0, 1, 10, 0);
      expect(placesAt(now, 5, 5)).toEqual([
        {
          zone: {
            kind: "paidZone",
            pricePerHour: 20,
            dailyCapCzk: null,
            maxStayMinutes: null,
            from: "00:00",
            until: "23:59",
            paidUntil: null,
            paidWindows: ["00:00–23:59"],
            code: "A",
            category: "MIX",
          },
          streetName: "Foo St",
          cleaning: NO_CLEANING,
          distanceMeters: 0,
        },
      ]);
    });

    it("reports a bounded tariff as paid inside its window", () => {
      const [place] = placesAt(new Date(2026, 3, 6, 10, 0), 25, 25);
      expect(place.zone).toEqual({
        kind: "paidZone",
        pricePerHour: 40,
        dailyCapCzk: 90,
        maxStayMinutes: null,
        from: "08:00",
        until: "17:59",
        paidUntil: { time: "18:00", daysAhead: 0, weekday: 0, minutesUntil: 480, rule: null },
        paidWindows: ["08:00–17:59"],
        code: "B",
        category: "MIX",
      });
    });

    it("reports a zone as free right now outside its tariff window", () => {
      const [place] = placesAt(new Date(2026, 3, 6, 20, 0), 25, 25);
      // The tariff runs on this weekday only, so it's paid again a week later.
      expect(place.zone).toEqual({
        kind: "freeZoneRightNow",
        paidFrom: {
          time: "08:00",
          daysAhead: 7,
          weekday: 0,
          minutesUntil: 7 * 24 * 60 - 12 * 60,
          rule: expect.objectContaining({ start: "08:00", end: "17:59", pricePerHour: 40 }),
        },
        maxStayMinutes: null,
        paidWindows: ["08:00–17:59"],
        code: "B",
        category: "MIX",
      });
    });

    it("lowers the cap to the tariff's holiday cap on a public holiday", () => {
      const [place] = placesAt(new Date(2026, 8, 28, 10, 0), -45, -45); // Den české státnosti
      expect(place.zone).toMatchObject({ kind: "paidZone", pricePerHour: 30, dailyCapCzk: 40 });
    });

    it("keeps the ordinary cap on the day after a holiday", () => {
      const [place] = placesAt(new Date(2026, 8, 29, 10, 0), -45, -45);
      expect(place.zone).toMatchObject({ kind: "paidZone", pricePerHour: 30, dailyCapCzk: null });
    });

    it("keeps a lower ordinary cap on a holiday", () => {
      const now = new Date(2026, 8, 28, 10, 0);
      const data = buildFixture(now);
      data.zps.tariffs[2].rules[0].dailyCapCzk = 25;
      const [place] = queryPlaces(data, buildIndexes(data), -45, -45, now);
      expect(place.zone).toMatchObject({ dailyCapCzk: 25 });
    });

    it("leaves a tariff with no holiday rule as it is on a holiday", () => {
      const [place] = placesAt(new Date(2026, 8, 28, 10, 0), 5, 5);
      expect(place.zone).toMatchObject({ kind: "paidZone", code: "A", dailyCapCzk: null });
    });

    it("reports a resident zone as paid, with its visitor limit, while its tariff runs", () => {
      const [place] = placesAt(new Date(2026, 3, 6, 10, 0), 85, 85);
      expect(place.zone).toMatchObject({
        kind: "paidZone",
        maxStayMinutes: 60,
        paidWindows: ["08:00–17:59"],
        code: "D",
        category: "RES",
      });
    });

    it("reports a resident zone as free for anyone outside its tariff hours", () => {
      const [place] = placesAt(new Date(2026, 3, 6, 20, 0), 85, 85);
      expect(place.zone).toEqual({
        kind: "freeZoneRightNow",
        paidFrom: {
          time: "08:00",
          daysAhead: 7,
          weekday: 0,
          minutesUntil: 7 * 24 * 60 - 12 * 60,
          rule: expect.objectContaining({ start: "08:00", end: "17:59", pricePerHour: 40 }),
        },
        maxStayMinutes: 60,
        paidWindows: ["08:00–17:59"],
        code: "D",
        category: "RES",
      });
    });

    it("reports a resident zone with no tariff as resident-only, at any time", () => {
      const [place] = placesAt(new Date(2026, 3, 6, 3, 0), 45, 45);
      expect(place.zone).toEqual({ kind: "residentZone", code: "C", category: "RES" });
    });
  });

  describe("street cleaning", () => {
    it("marks a zone's place as cleaned today when its street's section is", () => {
      const [place] = placesAt(new Date(2026, 3, 7, 10, 0), 5, 5);
      expect(place).toMatchObject({
        zone: { code: "A" },
        cleaning: { today: true, upcoming: null },
      });
    });

    it("marks every section as cleaned today when told to", () => {
      const [place] = placesAt(new Date(2026, 0, 1, 10, 0), 5, 5, null, true);
      expect(place.cleaning.today).toBe(true);
    });

    it("still needs a section in reach to mark cleaning", () => {
      const [place] = placesAt(new Date(2026, 0, 1, 10, 0), 45, 45, null, true);
      expect(place).toMatchObject({ zone: { code: "C" }, cleaning: NO_CLEANING });
    });

    it("makes a section on a street with no zone a place of its own, with cleaning ahead", () => {
      expect(placesAt(new Date(2026, 3, 5, 10, 0), 65, 65)).toEqual([
        {
          zone: null,
          streetName: "Bar St",
          cleaning: { today: false, upcoming: { date: "2026-04-10", daysUntil: 5 } },
          distanceMeters: 0,
        },
      ]);
    });

    it("leaves out cleaning further ahead than the warning window, or already past", () => {
      expect(placesAt(new Date(2026, 2, 1, 10, 0), 65, 65)[0].cleaning).toEqual(NO_CLEANING);
      expect(placesAt(new Date(2026, 3, 15, 10, 0), 65, 65)[0].cleaning).toEqual(NO_CLEANING);
    });

    it("counts a section once the accuracy circle reaches it, on the zone of the same street", () => {
      const now = new Date(2026, 0, 1, 10, 0);
      // The Near St section is ~39m from the point.
      expect(placesAt(now, 14.4005, 50.0005, 5)).toMatchObject([
        { zone: { code: "P1" }, cleaning: NO_CLEANING },
      ]);
      expect(placesAt(now, 14.4005, 50.0005, 45)).toMatchObject([
        {
          zone: { code: "P1" },
          streetName: "Near St",
          cleaning: { today: false, upcoming: { date: "2026-01-02", daysUntil: 1 } },
        },
      ]);
    });

    it("gives a section named by a placeholder code the street it's on", () => {
      const places = placesAt(new Date(2026, 0, 2, 10, 0), 14.4005, 50.0005, 60);
      expect(places.map((p) => [p.zone?.code, p.streetName, p.cleaning.today])).toEqual([
        ["P1", "Near St", true],
        ["P2", "Gap St", true],
      ]);
    });
  });

  describe("places with only a street", () => {
    it("leaves one out when a zone is in reach", () => {
      const places = placesAt(new Date(2026, 0, 1, 10, 0), 14.4005, 50.0005, 70);
      expect(places.map((p) => p.streetName)).not.toContain("Side St");
    });

    it("keeps it when its street has cleaning coming up", () => {
      const places = placesAt(new Date(2026, 3, 8, 10, 0), 14.4005, 50.0005, 70);
      expect(places.find((p) => p.streetName === "Side St")).toMatchObject({
        zone: null,
        cleaning: { today: false, upcoming: { date: "2026-04-10", daysUntil: 2 } },
      });
    });

    it("keeps just one when there's nothing else", () => {
      // Near Lone St's cleaning section, with no cleaning within the warning window.
      const places = placesAt(new Date(2026, 2, 1, 10, 0), 14.5002, 50.0003, 30);
      expect(places).toEqual([
        {
          zone: null,
          streetName: "Lone St",
          cleaning: NO_CLEANING,
          distanceMeters: expect.any(Number),
        },
      ]);
    });
  });

  describe("the accuracy circle", () => {
    it("names the street a zone is on, even when it's further than the fix's accuracy", () => {
      const places = placesAt(new Date(2026, 0, 1, 10, 0), 14.4005, 50.0005, 5);
      expect(places).toMatchObject([
        { zone: { code: "P1" }, streetName: "Near St", distanceMeters: 0 },
      ]);
    });

    it("reports every zone it reaches, nearest first, each with its own street", () => {
      const places = placesAt(new Date(2026, 0, 1, 10, 0), 14.4005, 50.0005, 60);
      expect(places.map((p) => [p.zone?.kind, p.zone?.code, p.streetName])).toEqual([
        ["paidZone", "P1", "Near St"],
        ["residentZone", "P2", "Gap St"],
      ]);
    });

    it("reports a zone it reaches with the fix just outside, at its distance", () => {
      // ~14m west of P1, and ~100m from P2.
      const [place] = placesAt(new Date(2026, 0, 1, 10, 0), 14.3998, 50.0005, 20);
      expect(place).toMatchObject({ zone: { code: "P1" }, streetName: "Near St" });
      expect(place.distanceMeters).toBeCloseTo(14.3, 0);
    });

    it("reaches at least 10m even for a precise fix, and no zone past that", () => {
      const now = new Date(2026, 0, 1, 10, 0);
      expect(placesAt(now, 14.3998, 50.0005, 5)).toEqual([
        { zone: null, streetName: null, cleaning: NO_CLEANING, distanceMeters: 0 },
      ]);
    });

    it("with no zone or cleaning in reach, finds the street within the circle, at least 25m", () => {
      const now = new Date(2026, 3, 6, 10, 0);
      // ~45m north of Lone St, and ~53m from its cleaning section.
      expect(placesAt(now, 14.5008, 50.0004, 5)).toEqual([
        { zone: null, streetName: null, cleaning: NO_CLEANING, distanceMeters: 0 },
      ]);
      expect(placesAt(now, 14.5008, 50.0004, 48)).toEqual([
        { zone: null, streetName: "Lone St", cleaning: NO_CLEANING, distanceMeters: 0 },
      ]);
    });

    it("reports nothing beyond 100m, however inaccurate the fix", () => {
      // P3 is ~15km away.
      const places = placesAt(new Date(2026, 0, 1, 10, 0), 14.4005, 50.0005, 50_000);
      expect(places.map((p) => p.zone?.code)).toEqual(["P1", "P2"]);
    });
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
