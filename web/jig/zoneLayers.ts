// maplibre-gl's own type declarations import this package, so it's always installed with it.
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { ZONE_CATEGORY } from "../src/describe";
import type { LetniData, ZpsData } from "../src/types";

export interface Overlays {
  zones: boolean;
  cleaning: boolean;
}

const LAYERS: Record<keyof Overlays, string[]> = {
  zones: ["zones-fill", "zones-line", "zones-label"],
  cleaning: ["cleaning-fill", "cleaning-line"],
};

export const CLEANING_COLOR = "#dc2626";

/**
 * Draws the app's own datasets under the pin: paid zones in their category colours with
 * their codes, and street-cleaning sections in red. They're read from the same files the
 * app downloads, so the map shows exactly the shapes the app is answering from.
 */
export function addZoneLayers(map: MapLibreMap, overlays: Overlays): void {
  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource("zones", { type: "geojson", data: empty });
  map.addSource("cleaning", { type: "geojson", data: empty });

  const categoryColor: ExpressionSpecification = [
    "match",
    ["get", "category"],
    "RES",
    ZONE_CATEGORY.RES.colorHex,
    "MIX",
    ZONE_CATEGORY.MIX.colorHex,
    "VIS",
    ZONE_CATEGORY.VIS.colorHex,
    "#6b7280",
  ];

  map.addLayer({
    id: "cleaning-fill",
    type: "fill",
    source: "cleaning",
    paint: { "fill-color": CLEANING_COLOR, "fill-opacity": 0.2 },
  });
  map.addLayer({
    id: "cleaning-line",
    type: "line",
    source: "cleaning",
    paint: { "line-color": CLEANING_COLOR, "line-width": 1, "line-dasharray": [2, 2] },
  });
  map.addLayer({
    id: "zones-fill",
    type: "fill",
    source: "zones",
    paint: { "fill-color": categoryColor, "fill-opacity": 0.15 },
  });
  map.addLayer({
    id: "zones-line",
    type: "line",
    source: "zones",
    paint: { "line-color": categoryColor, "line-width": 1.2 },
  });
  map.addLayer({
    id: "zones-label",
    type: "symbol",
    source: "zones",
    minzoom: 16,
    layout: { "text-field": ["get", "code"], "text-font": ["Noto Sans Bold"], "text-size": 11 },
    paint: { "text-color": categoryColor, "text-halo-color": "#fff", "text-halo-width": 1.5 },
  });
  setOverlayVisibility(map, overlays);

  const load = async <T>(name: string): Promise<T> => (await fetch(`/data/${name}.json`)).json();
  load<ZpsData>("zps").then(({ features }) =>
    map.getSource<GeoJSONSource>("zones")?.setData({ type: "FeatureCollection", features }),
  );
  load<LetniData>("letni").then(({ features }) =>
    map.getSource<GeoJSONSource>("cleaning")?.setData({ type: "FeatureCollection", features }),
  );
}

export function setOverlayVisibility(map: MapLibreMap, overlays: Overlays): void {
  for (const [overlay, ids] of Object.entries(LAYERS)) {
    const visibility = overlays[overlay as keyof Overlays] ? "visible" : "none";
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  }
}
