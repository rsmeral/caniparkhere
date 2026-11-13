import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

/**
 * The map's colours and line weights. The base map is quiet, so the zones, the street
 * cleaning and the position drawn over it stand out, while the streets stand clearly apart
 * from the blocks and buildings between them. Tuned in the style jig's Map section.
 */
export interface MapPalette {
  /** The box behind the map, and its text, while the map loads. */
  loading: string;
  loadingText: string;
  background: string;
  water: string;
  park: string;
  building: string;
  buildingOutline: string;
  roadCasing: string;
  road: string;
  path: string;
  rail: string;
  label: string;
  labelHalo: string;
  /** Every zone, in its curb colour. */
  zoneFillOpacity: number;
  zoneLineWidth: number;
  /** The zones the answer is drawn from: the ones the position could be in. */
  candidateFillOpacity: number;
  candidateLineWidth: number;
  /** The zone tapped for its details. */
  selected: string;
  selectedLineWidth: number;
  cleaningToday: string;
  cleaningSoon: string;
  /** The position's dot and accuracy circle, and the ring around the dot. */
  position: string;
  positionRing: string;
  accuracyOpacity: number;
  /** The verdict emoji on each zone, as a multiple of 24px. */
  iconSize: number;
}

export const DEFAULT_MAP_PALETTE: MapPalette = {
  loading: "#262c36",
  loadingText: "#e5e7eb",
  background: "#e4e0d8",
  water: "#c0c8cc",
  park: "#d8d3c6",
  building: "#d0cbc0",
  buildingOutline: "#b9b3a6",
  roadCasing: "#aea796",
  road: "#fdfcf9",
  path: "#a39c8c",
  rail: "#aaa497",
  label: "#4f493f",
  labelHalo: "#fdfcf9",
  zoneFillOpacity: 0.18,
  zoneLineWidth: 1,
  candidateFillOpacity: 0.35,
  candidateLineWidth: 3,
  selected: "#111827",
  selectedLineWidth: 3,
  cleaningToday: "#dc2626",
  cleaningSoon: "#f59e0b",
  position: "#1f2937",
  positionRing: "#ffffff",
  accuracyOpacity: 0.12,
  iconSize: 1,
};

/** The images the cleaning layer is patterned with, one per kind of cleaning. */
export const HATCH = { today: "hatch-today", soon: "hatch-soon" } as const;

// OpenFreeMap: OpenStreetMap vector tiles in the OpenMapTiles schema, with no API key.
const TILES_URL = "https://tiles.openfreemap.org/planet";
const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const FONT = ["Noto Sans Regular"];

/** A width that grows with the zoom the way a real road's does, from z13 to z19. */
const widthByZoom = (atZ13: number, atZ19: number): ExpressionSpecification => [
  "interpolate",
  ["exponential", 1.6],
  ["zoom"],
  13,
  atZ13,
  19,
  atZ19,
];

const ROAD_CLASSES = {
  major: ["motorway", "trunk", "primary", "secondary"],
  minor: ["tertiary", "minor"],
  service: ["service", "track"],
};

const roadsOf = (classes: string[]): ExpressionSpecification => [
  "match",
  ["get", "class"],
  classes,
  true,
  false,
];

/**
 * The width of each class of road, with `extra` added for its casing. MapLibre wants the zoom
 * curve outermost, so the class is picked at each end of it.
 */
const roadWidth = (extra: number): ExpressionSpecification => {
  const byClass = (major: number, minor: number, service: number): ExpressionSpecification => [
    "match",
    ["get", "class"],
    ROAD_CLASSES.major,
    major + extra,
    ROAD_CLASSES.minor,
    minor + extra,
    service + extra,
  ];
  return [
    "interpolate",
    ["exponential", 1.6],
    ["zoom"],
    13,
    byClass(1.5, 0.8, 0.4),
    19,
    byClass(28, 18, 8),
  ];
};

const ROADS: ExpressionSpecification = roadsOf([
  ...ROAD_CLASSES.major,
  ...ROAD_CLASSES.minor,
  ...ROAD_CLASSES.service,
]);

/**
 * Every layer, bottom to top: the base map's areas and roads, the zones and street cleaning,
 * the accuracy circle, then the street names over them so they stay readable, the verdict
 * emoji, and the position on top.
 */
function layers(p: MapPalette): LayerSpecification[] {
  const tiles = { source: "openmaptiles" } as const;
  return [
    { id: "background", type: "background", paint: { "background-color": p.background } },
    {
      id: "park",
      type: "fill",
      ...tiles,
      "source-layer": "park",
      paint: { "fill-color": p.park },
    },
    {
      id: "landcover",
      type: "fill",
      ...tiles,
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["wood", "grass"], true, false],
      paint: { "fill-color": p.park },
    },
    {
      id: "water",
      type: "fill",
      ...tiles,
      "source-layer": "water",
      paint: { "fill-color": p.water },
    },
    {
      id: "building",
      type: "fill",
      ...tiles,
      "source-layer": "building",
      minzoom: 14,
      paint: { "fill-color": p.building, "fill-outline-color": p.buildingOutline },
    },
    {
      id: "rail",
      type: "line",
      ...tiles,
      "source-layer": "transportation",
      filter: ["match", ["get", "class"], ["rail", "transit"], true, false],
      paint: { "line-color": p.rail, "line-width": widthByZoom(0.6, 2.5) },
    },
    {
      id: "path",
      type: "line",
      ...tiles,
      "source-layer": "transportation",
      minzoom: 15,
      filter: ["match", ["get", "class"], ["path", "pedestrian"], true, false],
      paint: {
        "line-color": p.path,
        "line-width": widthByZoom(0.5, 2),
        "line-dasharray": [2, 1.5],
      },
    },
    {
      id: "road-casing",
      type: "line",
      ...tiles,
      "source-layer": "transportation",
      filter: ROADS,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": p.roadCasing, "line-width": roadWidth(1.5) },
    },
    {
      id: "road",
      type: "line",
      ...tiles,
      "source-layer": "transportation",
      filter: ROADS,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": p.road, "line-width": roadWidth(0) },
    },
    {
      id: "zones-fill",
      type: "fill",
      source: "zones",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["case", ["get", "candidate"], p.candidateFillOpacity, p.zoneFillOpacity],
      },
    },
    {
      id: "zones-line",
      type: "line",
      source: "zones",
      layout: { "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["case", ["get", "candidate"], p.candidateLineWidth, p.zoneLineWidth],
      },
    },
    {
      id: "cleaning-fill",
      type: "fill",
      source: "cleaning",
      paint: { "fill-pattern": ["case", ["get", "today"], HATCH.today, HATCH.soon] },
    },
    {
      id: "cleaning-line",
      type: "line",
      source: "cleaning",
      paint: {
        "line-color": ["case", ["get", "today"], p.cleaningToday, p.cleaningSoon],
        "line-width": ["case", ["get", "today"], 1.5, 1],
      },
    },
    {
      id: "zones-selected",
      type: "line",
      source: "zones",
      filter: ["get", "selected"],
      layout: { "line-join": "round" },
      paint: { "line-color": p.selected, "line-width": p.selectedLineWidth },
    },
    {
      id: "accuracy-fill",
      type: "fill",
      source: "position",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": p.position, "fill-opacity": p.accuracyOpacity },
    },
    {
      id: "accuracy-line",
      type: "line",
      source: "position",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "line-color": p.position, "line-opacity": 0.5, "line-width": 1 },
    },
    {
      id: "street-name",
      type: "symbol",
      ...tiles,
      "source-layer": "transportation_name",
      minzoom: 14,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 14],
        "text-max-angle": 30,
      },
      paint: {
        "text-color": p.label,
        "text-halo-color": p.labelHalo,
        "text-halo-width": 1.5,
      },
    },
    {
      id: "cleaning-icon",
      type: "symbol",
      source: "cleaning",
      minzoom: 15,
      filter: ["get", "today"],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": p.iconSize,
        "symbol-sort-key": 0,
      },
    },
    {
      id: "zones-icon",
      type: "symbol",
      source: "zones",
      minzoom: 15,
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": p.iconSize,
        // The zones the position could be in keep their emoji where they'd collide.
        "symbol-sort-key": ["case", ["get", "candidate"], 1, 2],
      },
    },
    {
      id: "position",
      type: "circle",
      source: "position",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 7,
        "circle-color": p.position,
        "circle-stroke-color": p.positionRing,
        "circle-stroke-width": 2.5,
      },
    },
  ];
}

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** The whole map style for a palette, with the app's own sources empty until filled. */
export function mapStyle(palette: MapPalette): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      openmaptiles: { type: "vector", url: TILES_URL },
      zones: { type: "geojson", data: EMPTY },
      cleaning: { type: "geojson", data: EMPTY },
      position: { type: "geojson", data: EMPTY },
    },
    layers: layers(palette),
  };
}

/**
 * Diagonal stripes in one colour on a clear background, as a fill pattern: the street
 * cleaning, laid over the zones without hiding them. Drawn at twice the size it's shown at.
 */
export function hatchImage(color: string): ImageData {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.globalAlpha = 0.85;
  // Three strokes so the stripes join up across the tile's edges.
  for (const offset of [-size, 0, size]) {
    ctx.beginPath();
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

/** Puts a palette on a map that's already showing, without reloading its tiles or data. */
export function applyPalette(map: MapLibreMap, palette: MapPalette): void {
  for (const layer of layers(palette)) {
    if (!map.getLayer(layer.id)) continue;
    // The properties come from the layer itself, so each one suits it; MapLibre's setters
    // just can't see that through Object.entries.
    const set = map as unknown as {
      setPaintProperty(layer: string, name: string, value: unknown): void;
      setLayoutProperty(layer: string, name: string, value: unknown): void;
    };
    for (const [name, value] of Object.entries(layer.paint ?? {})) {
      set.setPaintProperty(layer.id, name, value);
    }
    for (const [name, value] of Object.entries(layer.layout ?? {})) {
      set.setLayoutProperty(layer.id, name, value);
    }
  }
  map.updateImage(HATCH.today, hatchImage(palette.cleaningToday));
  map.updateImage(HATCH.soon, hatchImage(palette.cleaningSoon));
}
