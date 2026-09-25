// maplibre-gl's own type declarations import this package, so it's always installed with it.
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { ZONE_CATEGORY } from "../src/describe";
import { WARNING_WINDOW_DAYS } from "../src/query";
import type { LetniData, ZpsData } from "../src/types";

export interface Overlays {
  zones: boolean;
  cleaning: boolean;
}

const LAYERS: Record<keyof Overlays, string[]> = {
  zones: ["zones-fill", "zones-line", "zones-label"],
  cleaning: ["cleaning-fill", "cleaning-line"],
};

/**
 * The day street cleaning is shown for: a local `YYYY-MM-DD`, and whether every section is
 * being treated as cleaned that day, as the app is when simulating.
 */
export interface CleaningDay {
  day: string;
  everywhere: boolean;
}

/** Street-cleaning sections by when they're next cleaned, relative to the day shown. */
export const CLEANING_COLORS = {
  /** Closed on the day: the app says not to park. */
  today: "#dc2626",
  /** Within the app's warning window: it gives a heads-up. */
  soon: "#f59e0b",
  later: "#9ca3af",
};

/** @example addDays("2026-09-30", 2) -> "2026-10-02" */
function addDays(day: string, days: number): string {
  // Noon keeps a daylight-saving change from pushing the date across midnight.
  const date = new Date(`${day}T12:00`);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Picks one of `values` by a section's cleaning dates, which are stored as one
 * comma-joined string: MapLibre flattens array properties when it builds tiles, and `in`
 * on a string is a substring test.
 */
function byCleaningDay<T>(
  { day, everywhere }: CleaningDay,
  values: { today: T; soon: T; later: T },
): ExpressionSpecification {
  const cleanedOn = (d: string): ExpressionSpecification => ["in", d, ["get", "dates"]];
  const soonDays = Array.from({ length: WARNING_WINDOW_DAYS }, (_, i) => addDays(day, i + 1));
  return [
    "case",
    everywhere ? true : cleanedOn(day),
    values.today,
    ["any", ...soonDays.map(cleanedOn)],
    values.soon,
    values.later,
  ] as ExpressionSpecification;
}

/**
 * Draws the app's own datasets under the pin: paid zones in their category colours with
 * their codes, and street-cleaning sections coloured by when they're next cleaned. They're
 * read from the same files the app downloads, so the map shows exactly the shapes the app
 * is answering from.
 */
export function addZoneLayers(
  map: MapLibreMap,
  overlays: Overlays,
  cleaningDay: CleaningDay,
): void {
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

  map.addLayer({ id: "cleaning-fill", type: "fill", source: "cleaning" });
  map.addLayer({
    id: "cleaning-line",
    type: "line",
    source: "cleaning",
    paint: { "line-dasharray": [2, 2] },
  });
  setCleaningDay(map, cleaningDay);
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
  load<LetniData>("letni").then(({ dates, features }) =>
    map.getSource<GeoJSONSource>("cleaning")?.setData({
      type: "FeatureCollection",
      features: features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          dates: f.properties.datesId === null ? "" : dates[f.properties.datesId].join(","),
        },
      })),
    }),
  );
}

export function setCleaningDay(map: MapLibreMap, cleaningDay: CleaningDay): void {
  if (!map.getLayer("cleaning-fill")) return;
  map.setPaintProperty("cleaning-fill", "fill-color", byCleaningDay(cleaningDay, CLEANING_COLORS));
  map.setPaintProperty(
    "cleaning-fill",
    "fill-opacity",
    byCleaningDay(cleaningDay, { today: 0.4, soon: 0.3, later: 0.12 }),
  );
  map.setPaintProperty("cleaning-line", "line-color", byCleaningDay(cleaningDay, CLEANING_COLORS));
  map.setPaintProperty(
    "cleaning-line",
    "line-width",
    byCleaningDay(cleaningDay, { today: 2, soon: 1.5, later: 1 }),
  );
}

export function setOverlayVisibility(map: MapLibreMap, overlays: Overlays): void {
  for (const [overlay, ids] of Object.entries(LAYERS)) {
    const visibility = overlays[overlay as keyof Overlays] ? "visible" : "none";
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  }
}
