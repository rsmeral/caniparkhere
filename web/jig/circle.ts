import type { Feature, Polygon } from "geojson";
import { METERS_PER_DEG_LAT, metersPerDegLon } from "../src/spatialIndex";

/**
 * A circle of `radiusMeters` around a point, as a polygon. It uses the same local
 * degrees-to-metres conversion as the app's own lookups, so the drawn circle covers exactly
 * the area the app treats as within the accuracy radius.
 */
export function accuracyCircle(
  lon: number,
  lat: number,
  radiusMeters: number,
  steps = 64,
): Feature<Polygon> {
  const dLon = radiusMeters / metersPerDegLon(lat);
  const dLat = radiusMeters / METERS_PER_DEG_LAT;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}
