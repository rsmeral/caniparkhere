import { describe, expect, it } from "vitest";
import type { Feature, MultiLineString, MultiPolygon } from "geojson";
import { LineIndex, PolygonIndex } from "./spatialIndex";

// A degree of longitude at this latitude (~50°N, Prague) is roughly 71.5km, vs ~111.3km for
// a degree of latitude - fixtures below pick offsets small enough that the difference
// doesn't matter, so distances stay easy to reason about in plain "roughly N meters" terms.
const PRAGUE_LAT = 50;

function square(
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Feature<MultiPolygon, { id: string }> {
  return {
    type: "Feature",
    properties: { id },
    geometry: {
      type: "MultiPolygon",
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
    },
  };
}

describe("PolygonIndex", () => {
  it("finds a feature containing the point", () => {
    const index = new PolygonIndex([square("a", 0, 0, 10, 10)]);
    expect(index.findContaining(5, 5).map((f) => f.properties.id)).toEqual(["a"]);
  });

  it("returns empty when the point is outside every feature", () => {
    const index = new PolygonIndex([square("a", 0, 0, 10, 10)]);
    expect(index.findContaining(50, 50)).toEqual([]);
  });

  it("filters out bbox-only candidates that aren't actually inside the polygon", () => {
    // L-shape: bbox is 0..10 in both axes, but (8,8) sits in the notch cut out of it.
    const lShape: Feature<MultiPolygon, { id: string }> = {
      type: "Feature",
      properties: { id: "L" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [10, 0],
              [10, 5],
              [5, 5],
              [5, 10],
              [0, 10],
              [0, 0],
            ],
          ],
        ],
      },
    };
    const index = new PolygonIndex([lShape]);
    expect(index.findContaining(8, 8)).toEqual([]);
    expect(index.findContaining(2, 2)).toHaveLength(1);
  });

  it("distinguishes between multiple non-overlapping features", () => {
    const index = new PolygonIndex([square("a", 0, 0, 10, 10), square("b", 20, 20, 30, 30)]);
    expect(index.findContaining(25, 25).map((f) => f.properties.id)).toEqual(["b"]);
    expect(index.findContaining(5, 5).map((f) => f.properties.id)).toEqual(["a"]);
  });

  describe("findNearby", () => {
    it("reports 0 distance for a point inside the feature", () => {
      const index = new PolygonIndex([
        square("a", 14.4, PRAGUE_LAT, 14.5, PRAGUE_LAT + 1),
      ]);
      const [match] = index.findNearby(14.45, PRAGUE_LAT + 0.5, 10);
      expect(match.feature.properties.id).toBe("a");
      expect(match.distanceMeters).toBe(0);
      expect(match.point).toEqual([14.45, PRAGUE_LAT + 0.5]);
    });

    it("reports the distance to the nearest edge for a point just outside", () => {
      const index = new PolygonIndex([
        square("a", 14.4, PRAGUE_LAT, 14.5, PRAGUE_LAT + 1),
      ]);
      // ~0.0002 degrees of longitude at 50°N is roughly 14m.
      const [match] = index.findNearby(14.3998, PRAGUE_LAT + 0.5, 20);
      expect(match.feature.properties.id).toBe("a");
      expect(match.distanceMeters).toBeGreaterThan(0);
      expect(match.distanceMeters).toBeLessThan(20);
      expect(match.point[0]).toBeCloseTo(14.4, 9);
      expect(match.point[1]).toBeCloseTo(PRAGUE_LAT + 0.5, 9);
    });

    it("excludes features further than the search radius", () => {
      const index = new PolygonIndex([square("a", 14.4, PRAGUE_LAT, 14.5, PRAGUE_LAT + 1)]);
      expect(index.findNearby(14.3, PRAGUE_LAT + 0.5, 20)).toEqual([]);
    });

    it("returns every feature within radius, nearest first", () => {
      const index = new PolygonIndex([
        square("far", 14.4, PRAGUE_LAT, 14.5, PRAGUE_LAT + 1),
        square("near", 20, PRAGUE_LAT, 20.01, PRAGUE_LAT + 1),
      ]);
      const results = index.findNearby(20, PRAGUE_LAT + 0.5, 5);
      expect(results.map((r) => r.feature.properties.id)).toEqual(["near"]);
    });
  });
});

function line(
  id: string,
  coords: [number, number][],
): Feature<MultiLineString, { id: string }> {
  return {
    type: "Feature",
    properties: { id },
    geometry: { type: "MultiLineString", coordinates: [coords] },
  };
}

describe("LineIndex", () => {
  it("finds the line a point sits directly on", () => {
    const index = new LineIndex([
      line("a", [
        [14.4, PRAGUE_LAT],
        [14.5, PRAGUE_LAT],
      ]),
    ]);
    expect(index.findNearest(14.45, PRAGUE_LAT, 25)?.properties.id).toBe("a");
  });

  it("returns null when nothing is within the search radius", () => {
    const index = new LineIndex([
      line("a", [
        [14.4, PRAGUE_LAT],
        [14.5, PRAGUE_LAT],
      ]),
    ]);
    // ~0.01 degrees of latitude is over 1km away - well past a 25m radius.
    expect(index.findNearest(14.45, PRAGUE_LAT + 0.01, 25)).toBeNull();
  });

  it("picks the nearer of two candidate lines", () => {
    const index = new LineIndex([
      line("far", [
        [14.4, PRAGUE_LAT + 0.0005],
        [14.5, PRAGUE_LAT + 0.0005],
      ]),
      line("near", [
        [14.4, PRAGUE_LAT + 0.0001],
        [14.5, PRAGUE_LAT + 0.0001],
      ]),
    ]);
    expect(index.findNearest(14.45, PRAGUE_LAT, 100)?.properties.id).toBe("near");
  });

  it("measures distance to the nearest point on a segment, not just its endpoints", () => {
    const index = new LineIndex([
      line("a", [
        [14.4, PRAGUE_LAT],
        [14.4, PRAGUE_LAT + 0.001],
      ]),
    ]);
    // Perpendicular to the segment's midpoint, not near either endpoint.
    expect(index.findNearest(14.4005, PRAGUE_LAT + 0.0005, 50)?.properties.id).toBe("a");
  });
});
