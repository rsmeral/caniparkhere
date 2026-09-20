import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import RBush from "rbush";
import type { Feature, MultiPolygon } from "geojson";

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
}
