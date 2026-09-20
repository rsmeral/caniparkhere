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
