/// <reference types="vite/client" />
import {
  type GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef } from "preact/hooks";
import { accuracyCircle } from "./circle";
import type { Pin } from "./scenario";
import {
  addZoneLayers,
  type CleaningDay,
  type Overlays,
  setCleaningDay,
  setOverlayVisibility,
} from "./zoneLayers";

// OpenFreeMap: OpenStreetMap vector tiles with no API key, no registration and no usage
// limits. Positron is its quietest style, so anything drawn over it stands out.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// MapLibre looks for its worker next to its own module, which isn't where Vite serves a
// pre-bundled dependency from.
setWorkerUrl(workerUrl);

interface Props {
  pin: Pin;
  overlays: Overlays;
  cleaningDay: CleaningDay;
  onMove(lon: number, lat: number): void;
}

/**
 * A map with one draggable pin and its accuracy circle, over the app's zone data. Clicking
 * the map moves the pin.
 */
export function PinMap({ pin, overlays, cleaningDay, onMove }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  // MapLibre's handlers are bound once, so they read the latest props through refs.
  const latest = useRef({ pin, overlays, cleaningDay, onMove });
  latest.current = { pin, overlays, cleaningDay, onMove };

  useEffect(() => {
    const m = new MapLibreMap({
      container: container.current!,
      style: STYLE_URL,
      center: [pin.lon, pin.lat],
      zoom: 16,
    });
    m.addControl(new NavigationControl({ showCompass: false }));
    m.addControl(new ScaleControl({ maxWidth: 120 }), "bottom-left");

    const mk = new Marker({ draggable: true, color: "#111827" })
      .setLngLat([pin.lon, pin.lat])
      .addTo(m);
    mk.on("drag", () => {
      const { lng, lat } = mk.getLngLat();
      latest.current.onMove(lng, lat);
    });
    m.on("click", (e) => latest.current.onMove(e.lngLat.lng, e.lngLat.lat));

    m.on("load", () => {
      addZoneLayers(m, latest.current.overlays, latest.current.cleaningDay);
      const p = latest.current.pin;
      m.addSource("accuracy", {
        type: "geojson",
        data: accuracyCircle(p.lon, p.lat, p.accuracyMeters),
      });
      m.addLayer({
        id: "accuracy-fill",
        type: "fill",
        source: "accuracy",
        paint: { "fill-color": "#111827", "fill-opacity": 0.12 },
      });
      m.addLayer({
        id: "accuracy-line",
        type: "line",
        source: "accuracy",
        paint: { "line-color": "#111827", "line-width": 1.5 },
      });
    });

    map.current = m;
    marker.current = mk;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    marker.current?.setLngLat([pin.lon, pin.lat]);
    m.getSource<GeoJSONSource>("accuracy")?.setData(
      accuracyCircle(pin.lon, pin.lat, pin.accuracyMeters),
    );
    // A pin set from outside the map, such as an edited URL hash, can land off screen.
    if (!m.getBounds().contains([pin.lon, pin.lat])) m.jumpTo({ center: [pin.lon, pin.lat] });
  }, [pin]);

  useEffect(() => {
    if (map.current?.isStyleLoaded()) setOverlayVisibility(map.current, overlays);
  }, [overlays]);

  useEffect(() => {
    if (map.current) setCleaningDay(map.current, cleaningDay);
  }, [cleaningDay.day, cleaningDay.everywhere]);

  return <div className="jig__map" ref={container} />;
}
