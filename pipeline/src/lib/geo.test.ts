import { describe, expect, it, vi } from "vitest";
import { bboxOfGeometry, mergeBbox, padBbox, roundGeometry, simplifyGeometry } from "./geo.js";

describe("roundGeometry", () => {
  it("rounds coordinates to ~1m precision (5 decimals)", () => {
    const rounded = roundGeometry({
      type: "Point",
      coordinates: [14.519748159000073, 50.11692310700005],
    } as any);
    expect(rounded.coordinates).toEqual([14.51975, 50.11692]);
  });

  it("rounds nested coordinate arrays (e.g. MultiPolygon rings)", () => {
    const rounded = roundGeometry({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [14.123456, 50.654321],
            [14.1, 50.6],
          ],
        ],
      ],
    } as any);
    expect(rounded.coordinates).toEqual([
      [
        [
          [14.12346, 50.65432],
          [14.1, 50.6],
        ],
      ],
    ]);
  });
});

describe("simplifyGeometry", () => {
  it("falls back to the unsimplified geometry when turf simplify throws", async () => {
    vi.resetModules();
    vi.doMock("@turf/simplify", () => ({
      default: () => {
        throw new Error("invalid polygon, fewer than 4 points");
      },
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { simplifyGeometry: simplifyWithMock } = await import("./geo.js");
    const geometry = { type: "Point", coordinates: [14.5, 50.1] } as any;
    expect(simplifyWithMock(geometry, 0.00002)).toEqual(geometry);
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
    vi.doUnmock("@turf/simplify");
    vi.resetModules();
  });

  it("returns a simplified geometry on the happy path", () => {
    const square = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [0.5, 1.001],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      ],
    } as any;
    const simplified = simplifyGeometry(square, 0.01);
    expect(simplified.type).toBe("Polygon");
    expect(simplified.coordinates[0].length).toBeLessThan(square.coordinates[0].length);
  });
});

describe("bboxOfGeometry", () => {
  it("computes the envelope of a Point", () => {
    expect(bboxOfGeometry({ type: "Point", coordinates: [14.5, 50.1] } as any)).toEqual({
      minLon: 14.5,
      minLat: 50.1,
      maxLon: 14.5,
      maxLat: 50.1,
    });
  });

  it("computes the envelope of a MultiPolygon across multiple rings", () => {
    const geom = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [14, 50],
            [14.1, 50],
            [14.1, 50.1],
          ],
        ],
        [
          [
            [13.9, 49.9],
            [14, 49.9],
          ],
        ],
      ],
    } as any;
    expect(bboxOfGeometry(geom)).toEqual({
      minLon: 13.9,
      minLat: 49.9,
      maxLon: 14.1,
      maxLat: 50.1,
    });
  });

  it("computes the envelope of a MultiLineString", () => {
    const geom = {
      type: "MultiLineString",
      coordinates: [
        [
          [14.5, 50.1],
          [14.52, 50.12],
        ],
      ],
    } as any;
    expect(bboxOfGeometry(geom)).toEqual({
      minLon: 14.5,
      minLat: 50.1,
      maxLon: 14.52,
      maxLat: 50.12,
    });
  });
});

describe("mergeBbox", () => {
  it("returns the smallest bbox containing both inputs", () => {
    const a = { minLon: 0, minLat: 0, maxLon: 1, maxLat: 1 };
    const b = { minLon: -1, minLat: 0.5, maxLon: 0.5, maxLat: 2 };
    expect(mergeBbox(a, b)).toEqual({ minLon: -1, minLat: 0, maxLon: 1, maxLat: 2 });
  });
});

describe("padBbox", () => {
  it("expands every side by the given margin", () => {
    const bbox = { minLon: 14, minLat: 50, maxLon: 14.5, maxLat: 50.2 };
    const padded = padBbox(bbox, 0.1);
    expect(padded.minLon).toBeCloseTo(13.9);
    expect(padded.minLat).toBeCloseTo(49.9);
    expect(padded.maxLon).toBeCloseTo(14.6);
    expect(padded.maxLat).toBeCloseTo(50.3);
  });

  it("defaults to a 0.1 degree margin", () => {
    const bbox = { minLon: 14, minLat: 50, maxLon: 14.5, maxLat: 50.2 };
    expect(padBbox(bbox)).toEqual(padBbox(bbox, 0.1));
  });
});
