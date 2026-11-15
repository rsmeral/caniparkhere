import { useEffect, useMemo, useState } from "preact/hooks";
import { describePlace, type Card } from "../describe";
import { mapFeatures, type MapFeatures } from "../mapFeatures";
import { DEFAULT_MAP_PALETTE, type MapPalette } from "../mapStyle";
import type { MapArea, Place } from "../query";
import type { QueryClient, QueryOptions } from "../queryClient";
import type { Bounds } from "../types";
import type { Vehicle } from "../vehicle";
import { CandidateBox } from "./CandidateBox";
import type { MapView as MapViewComponent, Position } from "./MapView";

interface Props {
  position: Position;
  consented: boolean;
  onConsent(accepted: boolean): void;
  client: Pick<QueryClient, "mapArea" | "zonePlace">;
  options: QueryOptions;
  /** Changes whenever the zones' rules may have, so what's drawn is asked for again. */
  refreshKey: string;
  vehicle: Vehicle;
  permits: string[];
  /** The codes of the zones the position could be in. */
  candidates: string[];
  palette?: MapPalette;
  /** A card picked from the squares above the map, to open over it. */
  pickedCard: Card | null;
  onPickedCardClose(): void;
}

// The zones are asked for this much further than the view on every side, so a short pan
// doesn't need new ones.
const MARGIN = 0.25;

/** @example widen({minLon:0, minLat:0, maxLon:4, maxLat:2}, 0.25) -> {minLon:-1, minLat:-0.5, maxLon:5, maxLat:2.5} */
function widen(box: Bounds, margin: number): Bounds {
  const dLon = (box.maxLon - box.minLon) * margin;
  const dLat = (box.maxLat - box.minLat) * margin;
  return {
    minLon: box.minLon - dLon,
    minLat: box.minLat - dLat,
    maxLon: box.maxLon + dLon,
    maxLat: box.maxLat + dLat,
  };
}

function contains(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.minLon >= outer.minLon &&
    inner.minLat >= outer.minLat &&
    inner.maxLon <= outer.maxLon &&
    inner.maxLat <= outer.maxLat
  );
}

const NO_FEATURES: MapFeatures = {
  zones: { type: "FeatureCollection", features: [] },
  cleaning: { type: "FeatureCollection", features: [] },
};

/**
 * The map in its rounded box, under the cards rolled up into squares. Until the user agrees to
 * load it, the box says where the map comes from and what that means for their privacy. A
 * tapped zone, or a picked square, opens its card over the bottom of the map, with the advice
 * it would get on its own.
 */
export function MapPanel({
  position,
  consented,
  onConsent,
  client,
  options,
  refreshKey,
  vehicle,
  permits,
  candidates,
  palette = DEFAULT_MAP_PALETTE,
  pickedCard,
  onPickedCardClose,
}: Props) {
  const [MapView, setMapView] = useState<typeof MapViewComponent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<Bounds | null>(null);
  const [area, setArea] = useState<{ box: Bounds; key: string; data: MapArea } | null>(null);
  const [tapped, setTapped] = useState<{ code: string; lon: number; lat: number } | null>(null);
  const [tappedPlace, setTappedPlace] = useState<Place | null>(null);

  // The map's code is loaded only once the user has agreed to the map.
  useEffect(() => {
    if (!consented || MapView) return;
    import("./MapView").then(
      (module) => setMapView(() => module.MapView),
      (err) => {
        console.error(err);
        setLoadFailed(true);
      },
    );
  }, [consented]);

  useEffect(() => {
    if (!view || (area && area.key === refreshKey && contains(area.box, view))) return;
    const box = widen(view, MARGIN);
    let live = true;
    client.mapArea(box, options).then(
      (data) => live && setArea({ box, key: refreshKey, data }),
      (err) => console.error(err),
    );
    return () => {
      live = false;
    };
  }, [view, refreshKey]);

  useEffect(() => {
    setTappedPlace(null);
    if (!tapped) return;
    let live = true;
    client.zonePlace(tapped.code, tapped.lon, tapped.lat, options).then(
      (place) => live && setTappedPlace(place),
      (err) => console.error(err),
    );
    return () => {
      live = false;
    };
  }, [tapped, refreshKey]);

  // One card at a time over the map: a zone tapped on it, or a card picked from the squares.
  useEffect(() => {
    if (pickedCard) setTapped(null);
  }, [pickedCard?.key]);

  // A tap anywhere on the map closes a picked card; a tap on a zone opens that zone's instead.
  const tapMap = (zone: { code: string; lon: number; lat: number } | null) => {
    setTapped(zone);
    onPickedCardClose();
  };

  const shownCard =
    tapped && tappedPlace
      ? describePlace(tappedPlace, vehicle, permits)
      : tapped
        ? null
        : pickedCard;
  const closeCard = () => (tapped ? setTapped(null) : onPickedCardClose());
  const selectedCode = tapped?.code ?? pickedCard?.zone?.code ?? null;

  const features = useMemo(
    () => (area ? mapFeatures(area.data, vehicle, permits, candidates, selectedCode) : NO_FEATURES),
    [area, vehicle, permits.join(), candidates.join(), selectedCode],
  );

  if (!consented) {
    return (
      <div className="app__map app__map--consent">
        <div className="app__map-consent">
          <h2 className="app__map-consent-title">Show a map?</h2>
          <p>
            The map's streets come from OpenFreeMap, over the internet. To get the right part of the
            map, your phone asks their servers for the area around you, so they could tell roughly
            where you are.
          </p>
          <p>The zones and your position are drawn by the app itself, on your phone.</p>
          <div className="app__map-consent-actions">
            <button
              type="button"
              className="app__map-consent-accept"
              onClick={() => onConsent(true)}
            >
              Show the map
            </button>
            <button
              type="button"
              className="app__map-consent-decline"
              onClick={() => onConsent(false)}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app__map" style={{ background: palette.loading, color: palette.loadingText }}>
      {MapView ? (
        <MapView
          position={position}
          features={features}
          palette={palette}
          onView={setView}
          onTap={tapMap}
        />
      ) : (
        <p className="app__map-status">
          {loadFailed ? "Can't load the map. Try again online." : "Loading the map..."}
        </p>
      )}
      {shownCard && (
        <div className="app__map-card">
          <CandidateBox card={shownCard} expanded onClose={closeCard} />
        </div>
      )}
    </div>
  );
}
