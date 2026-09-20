import { describe, expect, it } from "vitest";
import type { Feature, MultiPolygon } from "geojson";
import { PolygonIndex } from "./spatialIndex";

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
});
