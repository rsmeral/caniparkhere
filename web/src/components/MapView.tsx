/// <reference types="vite/client" />
import {
  AttributionControl,
  type GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "preact/hooks";
import { accuracyCircle } from "../accuracyCircle";
import { emojiUrl } from "../emoji";
import { iconsOf, type MapFeatures } from "../mapFeatures";
import { applyPalette, HATCH, hatchImage, mapStyle, type MapPalette } from "../mapStyle";
import type { Bounds } from "../types";

// MapLibre looks for its worker next to its own module, which isn't where Vite puts it.
setWorkerUrl(workerUrl);

export interface Position {
  lon: number;
  lat: number;
  accuracyMeters: number;
}

interface Props {
  position: Position;
  features: MapFeatures;
  palette: MapPalette;
  /** Told the part of the map in view, once it's loaded and after every move. */
  onView(box: Bounds): void;
  /** A tap on a zone, or null for a tap anywhere else. */
  onTap(zone: { code: string; lon: number; lat: number } | null): void;
}

// The map is for the streets around the position: zoomed out further, the zones are too
// small to tell apart, and there are too many to draw.
const MIN_ZOOM = 14;
const MAX_ZOOM = 19;
// How close the map starts, however precise the fix: about a block across.
const START_MAX_ZOOM = 17.5;
// How far around a tap still counts as on a zone. Zones are narrow strips along the curb.
const TAP_SLOP_PX = 10;
// Emoji are drawn at this size in CSS pixels, at twice the resolution.
const ICON_PX = 24;

/** Draws an emoji's Twemoji image for the map, at twice its size for sharp edges. */
async function emojiImage(emoji: string): Promise<ImageData> {
  const img = new Image();
  img.src = emojiUrl(emoji);
  await img.decode();
  const size = ICON_PX * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

function positionData(p: Position): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      accuracyCircle(p.lon, p.lat, p.accuracyMeters),
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } },
    ],
  };
}

/** The view that fits the whole accuracy circle, up to START_MAX_ZOOM. */
function fitPosition(map: MapLibreMap, p: Position, animate: boolean) {
  const circle = accuracyCircle(p.lon, p.lat, p.accuracyMeters, 16).geometry.coordinates[0];
  const bounds = circle.reduce(
    (b, [lon, lat]) => b.extend([lon, lat]),
    new LngLatBounds([p.lon, p.lat], [p.lon, p.lat]),
  );
  map.fitBounds(bounds, { padding: 40, maxZoom: START_MAX_ZOOM, animate });
}

function boxOf(map: MapLibreMap): Bounds {
  const b = map.getBounds();
  return { minLon: b.getWest(), minLat: b.getSouth(), maxLon: b.getEast(), maxLat: b.getNorth() };
}

/**
 * The map itself: the base map from OpenFreeMap, the app's zones and street cleaning over it,
 * and the position with its accuracy circle. It starts on the position and follows it, until
 * the map is dragged or zoomed by hand; the button in its corner goes back to following.
 */
export function MapView({ position, features, palette, onView, onTap }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState(true);
  const loadedIcons = useRef(new Set<string>());
  // MapLibre's handlers are bound once, so they read the latest props through a ref.
  const latest = useRef({ position, onView, onTap, following });
  latest.current = { position, onView, onTap, following };

  useEffect(() => {
    const m = new MapLibreMap({
      container: container.current!,
      style: mapStyle(palette),
      center: [position.lon, position.lat],
      zoom: START_MAX_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      // A phone held in one hand turns the map by accident far more often than on purpose.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new AttributionControl({ compact: true }), "bottom-right");
    fitPosition(m, position, false);

    m.on("load", () => {
      m.addImage(HATCH.today, hatchImage(palette.cleaningToday), { pixelRatio: 2 });
      m.addImage(HATCH.soon, hatchImage(palette.cleaningSoon), { pixelRatio: 2 });
      setLoaded(true);
      latest.current.onView(boxOf(m));
    });
    m.on("moveend", () => latest.current.onView(boxOf(m)));
    // Only a move made by hand has an originalEvent; easing to a new fix has none.
    const stopFollowing = (e: { originalEvent?: Event }) => {
      if (e.originalEvent) setFollowing(false);
    };
    m.on("dragstart", stopFollowing);
    m.on("zoomstart", stopFollowing);
    m.on("click", (e) => {
      const { x, y } = e.point;
      const [hit] = m.queryRenderedFeatures(
        [
          [x - TAP_SLOP_PX, y - TAP_SLOP_PX],
          [x + TAP_SLOP_PX, y + TAP_SLOP_PX],
        ],
        { layers: ["zones-fill"] },
      );
      latest.current.onTap(
        hit ? { code: hit.properties.code as string, lon: e.lngLat.lng, lat: e.lngLat.lat } : null,
      );
    });

    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    m.getSource<GeoJSONSource>("position")?.setData(positionData(position));
    if (following) m.easeTo({ center: [position.lon, position.lat], duration: 500 });
  }, [loaded, position.lon, position.lat, position.accuracyMeters]);

  // Emoji images go in before the features that show them, so no zone is drawn without one.
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    let live = true;
    const missing = iconsOf(features).filter((icon) => !loadedIcons.current.has(icon));
    Promise.all(
      missing.map(async (icon) => {
        const image = await emojiImage(icon);
        if (!m.hasImage(icon)) m.addImage(icon, image, { pixelRatio: 2 });
        loadedIcons.current.add(icon);
      }),
    )
      .catch((err) => console.error(err))
      .then(() => {
        if (!live) return;
        m.getSource<GeoJSONSource>("zones")?.setData(features.zones);
        m.getSource<GeoJSONSource>("cleaning")?.setData(features.cleaning);
      });
    return () => {
      live = false;
    };
  }, [loaded, features]);

  useEffect(() => {
    if (map.current && loaded) applyPalette(map.current, palette);
  }, [loaded, palette]);

  const recentre = () => {
    if (!map.current) return;
    setFollowing(true);
    fitPosition(map.current, latest.current.position, true);
  };

  return (
    <>
      <div className="app__map-canvas" ref={container} />
      {!following && (
        <button
          type="button"
          className="app__map-recentre"
          aria-label="Back to my position"
          onClick={recentre}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
            <path
              d="M12 1v4M12 19v4M1 12h4M19 12h4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      )}
    </>
  );
}
