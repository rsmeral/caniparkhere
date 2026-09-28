import type { MultiPolygon } from "geojson";
import { describe, expect, it } from "vitest";
import { areasOfSection, compareAreas, isInside, parseAreas, type VphArea } from "./vph";

/** A square from (x, y) to (x + size, y + size), as VPH lists its points. */
const square = (x: number, y: number, size: number) =>
  [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ].map(([lng, lat]) => ({ lng: String(lng), lat: String(lat) }));

const area = (name: string, ...rings: ReturnType<typeof square>[]): VphArea => ({
  name,
  shape: { type: rings.length > 1 ? "MULTIPOLYGON" : "POLYGON", point: rings.flat() },
});

/** A tiny section around (x, y). */
const section = (x: number, y: number): MultiPolygon => ({
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [x - 0.1, y - 0.1],
        [x + 0.1, y - 0.1],
        [x + 0.1, y + 0.1],
        [x - 0.1, y + 0.1],
        [x - 0.1, y - 0.1],
      ],
    ],
  ],
});

describe("parseAreas", () => {
  it("splits a multipolygon's points into its rings and leaves out the whole city", () => {
    const areas = parseAreas([
      area("5", square(0, 0, 2), square(10, 10, 2)),
      area("TS_Praha", square(-50, -50, 100)),
    ]);
    expect(areas.map((a) => a.name)).toEqual(["5"]);
    expect(areas[0].rings).toHaveLength(2);
    expect(areas[0].rings[1][0]).toEqual([10, 10]);
  });

  it("skips a point that repeats the one before it, such as a doubled closing point", () => {
    const points = square(0, 0, 2);
    const doubled = [points[0], points[1], points[1], ...points.slice(2), points[0]];
    const [only] = parseAreas([area("5", doubled)]);
    expect(only.rings).toEqual([points.map((p) => [Number(p.lng), Number(p.lat)])]);
  });

  it("lists districts in number order, each followed by its sub-areas", () => {
    const names = ["10", "5.2", "8", "5", "10.1", "5.1"].map((n) => area(n, square(0, 0, 1)));
    expect(parseAreas(names).map((a) => a.name)).toEqual(["5", "5.1", "5.2", "8", "10", "10.1"]);
  });

  it("fails on an answer it doesn't recognise, rather than dropping permits", () => {
    expect(() => parseAreas({ error: "unauthorized" })).toThrow("expected a list");
    expect(() => parseAreas([area("Praha 5", square(0, 0, 1))])).toThrow(
      'unexpected name "Praha 5"',
    );
    expect(() => parseAreas([area("5.1", square(0, 0, 1))])).toThrow("no districts");
    const open = area("5", square(0, 0, 1).slice(0, 4));
    expect(() => parseAreas([open])).toThrow("doesn't close");
  });
});

describe("isInside", () => {
  it("treats a ring inside another as a hole", () => {
    const rings = parseAreas([area("5", square(0, 0, 10), square(4, 4, 2))])[0].rings;
    expect(isInside([1, 1], rings)).toBe(true);
    expect(isInside([5, 5], rings)).toBe(false);
    expect(isInside([20, 20], rings)).toBe(false);
  });
});

describe("areasOfSection", () => {
  // District 5 with two sub-areas that overlap along their border, x from 4 to 6.
  const areas = parseAreas([
    area("5", square(0, 0, 10)),
    area("5.1", square(0, 0, 6)),
    area("5.2", square(4, 0, 6)),
  ]);

  it("gives a section its district and sub-area", () => {
    expect(areasOfSection("P5-0001", section(1, 1), areas)).toEqual(["5", "5.1"]);
  });

  it("gives a section on a border both sub-areas", () => {
    expect(areasOfSection("P5-0002", section(5, 1), areas)).toEqual(["5", "5.1", "5.2"]);
  });

  it("falls back to the district in the code for a section outside every district", () => {
    const fallbacks: string[] = [];
    expect(areasOfSection("P6-0003", section(20, 20), areas, (c) => fallbacks.push(c))).toEqual([
      "6",
    ]);
    expect(fallbacks).toEqual(["P6-0003"]);
  });

  it("gives a section with no district in its code only the areas around it", () => {
    expect(areasOfSection("BUS-0001", section(20, 20), areas)).toEqual([]);
  });
});

describe("compareAreas", () => {
  it("orders by district number, not as text", () => {
    expect(["10", "9", "18.2", "18.10"].sort(compareAreas)).toEqual(["9", "10", "18.2", "18.10"]);
  });
});
