import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import RBush from "rbush";
import type { Feature, MultiLineString, MultiPolygon } from "geojson";

interface IndexItem<P> {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  feature: Feature<MultiPolygon, P>;
}

/** @example bboxOfMultiPolygon(square from [0,0] to [1,1]) -> [0, 0, 1, 1] */
function bboxOfMultiPolygon(geometry: MultiPolygon): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [minX, minY, maxX, maxY];
}

/** An R-tree over a set of MultiPolygon features, for fast "which polygons contain this point" queries. */
export class PolygonIndex<P> {
  private tree = new RBush<IndexItem<P>>();

  constructor(features: Feature<MultiPolygon, P>[]) {
    const items = features.map((feature) => {
      const [minX, minY, maxX, maxY] = bboxOfMultiPolygon(feature.geometry);
      return { minX, minY, maxX, maxY, feature };
    });
    this.tree.load(items);
  }

  /** Bbox-filters via the R-tree, then confirms with exact point-in-polygon on the few candidates. */
  findContaining(lon: number, lat: number): Feature<MultiPolygon, P>[] {
    const candidates = this.tree.search({ minX: lon, minY: lat, maxX: lon, maxY: lat });
    const point: [number, number] = [lon, lat];
    return candidates
      .filter((c) => booleanPointInPolygon(point, c.feature as Feature<MultiPolygon>))
      .map((c) => c.feature);
  }

  /**
   * Finds every feature within maxDistanceMeters of the point - 0 for one the point sits
   * inside, otherwise the distance to its nearest edge. For a GPS fix too coarse to trust
   * a single containment check: passing the fix's own accuracy radius here surfaces every
   * zone the point could plausibly actually be in. Sorted nearest-first.
   */
  findNearby(
    lon: number,
    lat: number,
    maxDistanceMeters: number,
  ): { feature: Feature<MultiPolygon, P>; distanceMeters: number }[] {
    const lonPad = maxDistanceMeters / metersPerDegLon(lat);
    const latPad = maxDistanceMeters / METERS_PER_DEG_LAT;
    const candidates = this.tree.search({
      minX: lon - lonPad,
      minY: lat - latPad,
      maxX: lon + lonPad,
      maxY: lat + latPad,
    });
    const point: [number, number] = [lon, lat];

    const results: { feature: Feature<MultiPolygon, P>; distanceMeters: number }[] = [];
    for (const c of candidates) {
      const inside = booleanPointInPolygon(point, c.feature as Feature<MultiPolygon>);
      const distanceMeters = inside ? 0 : pointToPolygonMeters(lon, lat, c.feature.geometry);
      if (distanceMeters <= maxDistanceMeters) results.push({ feature: c.feature, distanceMeters });
    }
    return results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
}

// Degrees-to-meters conversion is only approximate (a flat-earth projection local to the
// query point), which is plenty accurate at the scale of a single zone or street lookup.
// Shared by both PolygonIndex.findNearby (zone-boundary distance) and LineIndex (street
// centerline distance) below.
export const METERS_PER_DEG_LAT = 111_320;

export function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Shortest distance in meters from (lon, lat) to the segment [a, b], via a local planar projection. */
function pointToSegmentMeters(
  lon: number,
  lat: number,
  a: [number, number],
  b: [number, number],
): number {
  const mPerLon = metersPerDegLon(lat);
  const ax = (a[0] - lon) * mPerLon;
  const ay = (a[1] - lat) * METERS_PER_DEG_LAT;
  const bx = (b[0] - lon) * mPerLon;
  const by = (b[1] - lat) * METERS_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(ax, ay);
  const t = Math.max(0, Math.min(1, (-ax * dx - ay * dy) / lengthSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Shortest distance in meters from (lon, lat) to a MultiPolygon's boundary (all rings, all parts). */
function pointToPolygonMeters(lon: number, lat: number, geometry: MultiPolygon): number {
  let min = Infinity;
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const distance = pointToSegmentMeters(
          lon,
          lat,
          ring[i] as [number, number],
          ring[i + 1] as [number, number],
        );
        if (distance < min) min = distance;
      }
    }
  }
  return min;
}

interface LineSegmentItem<P> {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  a: [number, number];
  b: [number, number];
  feature: Feature<MultiLineString, P>;
}

/** An R-tree over a set of MultiLineString features, for "which line is closest to this point" queries. */
export class LineIndex<P> {
  private tree = new RBush<LineSegmentItem<P>>();

  constructor(features: Feature<MultiLineString, P>[]) {
    const items: LineSegmentItem<P>[] = [];
    for (const feature of features) {
      for (const line of feature.geometry.coordinates) {
        for (let i = 0; i < line.length - 1; i++) {
          const a = line[i] as [number, number];
          const b = line[i + 1] as [number, number];
          items.push({
            minX: Math.min(a[0], b[0]),
            minY: Math.min(a[1], b[1]),
            maxX: Math.max(a[0], b[0]),
            maxY: Math.max(a[1], b[1]),
            a,
            b,
            feature,
          });
        }
      }
    }
    this.tree.load(items);
  }

  /**
   * Finds the feature with the nearest segment to (lon, lat), if any segment falls within
   * maxDistanceMeters - bbox-filters candidate segments via the R-tree padded by that
   * radius, then measures each one exactly.
   */
  findNearest(lon: number, lat: number, maxDistanceMeters: number): Feature<MultiLineString, P> | null {
    const lonPad = maxDistanceMeters / metersPerDegLon(lat);
    const latPad = maxDistanceMeters / METERS_PER_DEG_LAT;
    const candidates = this.tree.search({
      minX: lon - lonPad,
      minY: lat - latPad,
      maxX: lon + lonPad,
      maxY: lat + latPad,
    });

    let best: { feature: Feature<MultiLineString, P>; distance: number } | null = null;
    for (const c of candidates) {
      const distance = pointToSegmentMeters(lon, lat, c.a, c.b);
      if (distance <= maxDistanceMeters && (!best || distance < best.distance)) {
        best = { feature: c.feature, distance };
      }
    }
    return best?.feature ?? null;
  }
}
