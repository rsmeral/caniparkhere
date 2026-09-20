import { describe, expect, it, vi } from "vitest";
import { roundGeometry, simplifyGeometry } from "./geo.js";

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
