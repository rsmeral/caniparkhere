import simplify from "@turf/simplify";
import type { Feature, Geometry } from "geojson";

// ~1m at Prague's latitude - plenty for a curb-level parking check.
const COORD_DECIMALS = 5;

function roundCoords(coords: any): any {
  if (typeof coords[0] === "number") {
    return coords.map((n: number) => Math.round(n * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS);
  }
  return coords.map(roundCoords);
}

/**
 * Rounds every coordinate in a geometry to COORD_DECIMALS places (~1m precision).
 * @example roundGeometry({type:"Point", coordinates:[14.519748159, 50.116923107]})
 *   -> {type:"Point", coordinates:[14.51975, 50.11692]}
 */
export function roundGeometry<G extends Geometry>(geometry: G): G {
  return {
    ...geometry,
    coordinates: roundCoords((geometry as any).coordinates),
  } as G;
}

export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

function walkCoords(coords: any, fn: (lon: number, lat: number) => void): void {
  if (typeof coords[0] === "number") {
    fn(coords[0], coords[1]);
  } else {
    for (const c of coords) walkCoords(c, fn);
  }
}

/** Axis-aligned bounding box (envelope) of a single geometry, regardless of its type/nesting. */
export function bboxOfGeometry(geometry: Geometry): Bbox {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  walkCoords((geometry as any).coordinates, (lon, lat) => {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  });
  return { minLon, minLat, maxLon, maxLat };
}

/** Combines two bboxes into the smallest one containing both. */
export function mergeBbox(a: Bbox, b: Bbox): Bbox {
  return {
    minLon: Math.min(a.minLon, b.minLon),
    minLat: Math.min(a.minLat, b.minLat),
    maxLon: Math.max(a.maxLon, b.maxLon),
    maxLat: Math.max(a.maxLat, b.maxLat),
  };
}

/**
 * Expands a bbox by a fixed margin in degrees on every side. Our zone data only covers
 * built-up/zoned areas, not Prague's full administrative extent (outer districts have no
 * paid parking or organized street cleaning) - padding generously here means someone in
 * an unzoned-but-real Prague neighborhood still reads as "in coverage" (falling through to
 * a normal "clear" result) rather than being incorrectly told the app doesn't cover them.
 * 0.1 degrees is ~11km of latitude and ~7km of longitude at Prague's latitude.
 */
export function padBbox(bbox: Bbox, marginDegrees = 0.1): Bbox {
  return {
    minLon: bbox.minLon - marginDegrees,
    minLat: bbox.minLat - marginDegrees,
    maxLon: bbox.maxLon + marginDegrees,
    maxLat: bbox.maxLat + marginDegrees,
  };
}

/**
 * Applies Douglas-Peucker simplification (via turf) at the given tolerance in degrees:
 * recursively drops points that lie within `tolerance` of the straight line between
 * their neighbors, keeping only the points needed to stay within that error bound.
 */
export function simplifyGeometry<G extends Geometry>(geometry: G, tolerance: number): G {
  const feature: Feature<G> = { type: "Feature", geometry, properties: {} };
  try {
    const simplified = simplify(feature, { tolerance, highQuality: true });
    return simplified.geometry as G;
  } catch (err) {
    // Tiny slivers can collapse below turf's minimum ring size after rounding.
    // Falling back to the unsimplified (but rounded) geometry beats failing the whole build.
    console.warn(
      `  simplify failed on a feature, keeping unsimplified geometry: ${(err as Error).message}`,
    );
    return geometry;
  }
}
