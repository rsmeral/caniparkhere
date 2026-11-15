import type { FeatureCollection, MultiPolygon } from "geojson";
import { adviceFor, CLEANING_TODAY, ZONE_CATEGORY } from "./describe";
import type { MapArea } from "./query";
import type { Vehicle } from "./vehicle";

/** What the map needs to draw a zone. MapLibre reads only flat properties. */
export interface ZoneMark {
  code: string;
  color: string;
  /** The emoji of the zone's advice for the vehicle, as the headline would show it. */
  icon: string;
  /** One of the zones the position could be in. */
  candidate: boolean;
  /** The zone tapped for its details. */
  selected: boolean;
}

export interface CleaningMark {
  today: boolean;
  icon: string;
}

export interface MapFeatures {
  zones: FeatureCollection<MultiPolygon, ZoneMark>;
  cleaning: FeatureCollection<MultiPolygon, CleaningMark>;
}

/**
 * The zones and street cleaning in a stretch of the map, as features to draw: each zone in
 * its curb colour with the emoji of its advice, and each section with cleaning today or soon.
 */
export function mapFeatures(
  area: MapArea,
  vehicle: Vehicle,
  permits: string[],
  candidates: string[],
  selected: string | null,
): MapFeatures {
  return {
    zones: {
      type: "FeatureCollection",
      features: area.zones.map(({ geometry, properties: { status } }) => ({
        type: "Feature",
        geometry,
        properties: {
          code: status.code,
          color: ZONE_CATEGORY[status.category].colorHex,
          icon: adviceFor(status, vehicle, permits).icon,
          candidate: candidates.includes(status.code),
          selected: status.code === selected,
        },
      })),
    },
    cleaning: {
      type: "FeatureCollection",
      features: area.cleaning.map(({ geometry, properties: { cleaning } }) => ({
        type: "Feature",
        geometry,
        properties: { today: cleaning.today, icon: CLEANING_TODAY.icon },
      })),
    },
  };
}

/** Every emoji the features show, for loading their images before they're drawn. */
export function iconsOf({ zones, cleaning }: MapFeatures): string[] {
  const icons = new Set(zones.features.map((f) => f.properties.icon));
  if (cleaning.features.some((f) => f.properties.today)) icons.add(CLEANING_TODAY.icon);
  return [...icons];
}
